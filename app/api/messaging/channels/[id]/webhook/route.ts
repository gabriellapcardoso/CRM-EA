import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { armarWebhookDoCanal, lerWebhookDoCanal } from '@/lib/messaging/arm-channel-webhook';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CanalAutorizado {
  id: string;
  channel_type: string;
  provider: string;
  external_identifier: string | null;
  credentials: Record<string, string> | null;
}

/**
 * Auth compartilhada pelos dois métodos: mesma forma da rota de qr-code
 * (origem, sessão, admin, isolamento por organização, soft-delete).
 */
async function autorizar(
  req: Request,
  channelId: string,
): Promise<{ canal: CanalAutorizado } | { erro: Response }> {
  if (!isAllowedOrigin(req)) {
    return { erro: json({ error: 'Forbidden' }, 403) };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { erro: json({ error: 'Unauthorized' }, 401) };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return { erro: json({ error: 'Profile not found' }, 404) };
  }

  if (profile.role !== 'admin') {
    return { erro: json({ error: 'Forbidden - Admin access required' }, 403) };
  }

  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('id, channel_type, provider, external_identifier, credentials')
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single();

  if (channelError || !channel) {
    return { erro: json({ error: 'Channel not found' }, 404) };
  }

  return { canal: channel as CanalAutorizado };
}

/**
 * POST /api/messaging/channels/[id]/webhook
 *
 * (Re)arma o webhook do canal no servidor do provider.
 *
 * Existe porque a rota de qr-code recusa canal que já está `connected` — e foi
 * exatamente nesse estado que o WhatsApp da aaagência ficou 5 semanas mudo:
 * conectado de verdade na Evolution, com webhook desabilitado. Não havia nenhum
 * caminho no app pra consertar isso sem desconectar o canal em produção.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { id: channelId } = await params;
  const auth = await autorizar(req, channelId);
  if ('erro' in auth) return auth.erro;

  const resultado = await armarWebhookDoCanal(auth.canal);

  if (!resultado.armado) {
    console.error('[webhook] Falha ao armar webhook do canal:', channelId, resultado.motivo);
    return json({ configured: false, url: resultado.url, error: resultado.motivo }, 502);
  }

  return json({ configured: true, url: resultado.url });
}

/**
 * GET /api/messaging/channels/[id]/webhook
 *
 * Diagnóstico: o que está gravado no servidor do provider, agora.
 *
 * `expectedUrl` vem junto de propósito — o modo de falha real não foi URL
 * errada, foi URL certa com `enabled: false`, sem eventos e sem header de
 * auth. Comparar as duas URLs sem olhar os outros três campos é reproduzir a
 * checagem que deixou passar.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { id: channelId } = await params;
  const auth = await autorizar(req, channelId);
  if ('erro' in auth) return auth.erro;

  const leitura = await lerWebhookDoCanal(auth.canal);

  if (leitura.motivo) {
    console.error('[webhook] Falha ao ler config de webhook:', channelId, leitura.motivo);
    return json({ error: leitura.motivo, expectedUrl: leitura.urlEsperada }, 502);
  }

  return json({
    supported: leitura.suportado,
    expectedUrl: leitura.urlEsperada,
    healthy: leitura.saudavel,
    config: leitura.config,
  });
}
