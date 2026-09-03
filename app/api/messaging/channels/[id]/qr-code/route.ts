import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { ChannelProviderFactory } from '@/lib/messaging';
import { armarWebhookDoCanal } from '@/lib/messaging/arm-channel-webhook';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

const QR_SUPPORTED_PROVIDERS = ['z-api', 'evolution'] as const;
type QrSupportedProvider = (typeof QR_SUPPORTED_PROVIDERS)[number];

function isQrSupportedProvider(provider: string): provider is QrSupportedProvider {
  return (QR_SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}

/**
 * POST /api/messaging/channels/[id]/qr-code
 * Obtém QR code para conexão do canal WhatsApp (Z-API ou Evolution)
 */
export async function POST(req: Request, { params }: RouteParams) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { id: channelId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  // Apenas admins podem gerenciar canais
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  // Buscar canal
  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('id, channel_type, provider, external_identifier, credentials, status')
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single();

  if (channelError || !channel) {
    return json({ error: 'Channel not found' }, 404);
  }

  // Verificar se o provider suporta QR code
  if (channel.channel_type !== 'whatsapp' || !isQrSupportedProvider(channel.provider)) {
    return json({ error: 'QR code is only available for z-api or evolution WhatsApp channels' }, 400);
  }

  // Verificar se já está conectado
  if (channel.status === 'connected') {
    return json({ error: 'Channel is already connected' }, 400);
  }

  // Arma o webhook ANTES de qualquer coisa com o provider, nunca depois. Três
  // motivos, e os dois últimos só apareceram em produção:
  //
  // 1. Quem confirma que o QR foi lido é o `connection.update` que a Evolution
  //    manda PRO webhook. Desarmado nesse instante, o evento se perde e o canal
  //    nunca sai de waiting_qr (mesmo deadlock da issue #3).
  // 2. Armar depois do `getQrCode()` pendura o arme numa chamada que pode
  //    falhar. Em 2026-09-03 ela falhou (a Evolution devolveu pairingCode em
  //    vez de QR) e o webhook ficou sem armar: o canal foi pra `error` com
  //    webhook nulo, exigindo duas correções em vez de uma.
  // 3. Fora do try, o resultado serve os três caminhos de saída (QR gerado,
  //    já conectado, erro) sem armar duas vezes. `armarWebhookDoCanal` não
  //    lança por contrato, então não precisa de try próprio.
  const webhook = await armarWebhookDoCanal({
    id: channel.id,
    channel_type: channel.channel_type,
    provider: channel.provider,
    external_identifier: channel.external_identifier,
    credentials: channel.credentials as Record<string, string>,
  });

  if (!webhook.armado) {
    console.error('[qr-code] Falha ao armar webhook do canal:', channel.id, webhook.motivo);
  }

  try {
    // Criar provider e obter QR code (dinâmico — z-api ou evolution)
    const provider = ChannelProviderFactory.createProvider('whatsapp', channel.provider);

    await provider.initialize({
      channelId: channel.id,
      channelType: 'whatsapp',
      provider: channel.provider,
      externalIdentifier: channel.external_identifier,
      credentials: channel.credentials as Record<string, string>,
    });

    if (!('getQrCode' in provider)) {
      return json({ error: 'Provider does not support QR code' }, 500);
    }

    const qrResult = await (provider as { getQrCode: () => Promise<{ qrCode: string; expiresAt: string }> }).getQrCode();

    // Atualizar status do canal para waiting_qr — logar falha de update sem
    // quebrar a resposta (o QR já foi gerado no provider, o admin ainda pode
    // escaneá-lo mesmo que o status no banco fique desatualizado)
    const { error: updateError } = await supabase
      .from('messaging_channels')
      .update({
        status: 'waiting_qr',
        updated_at: new Date().toISOString(),
      })
      .eq('id', channelId);

    if (updateError) {
      console.error('Failed to update channel status to waiting_qr:', updateError);
    }

    return json({
      qrCode: qrResult.qrCode,
      expiresAt: qrResult.expiresAt,
      // Sobe na resposta pra UI não poder alegar sucesso liso: QR na tela com
      // webhook desarmado é canal que conecta e nunca recebe nada.
      webhookConfigured: webhook.armado,
      ...(webhook.armado ? {} : { webhookWarning: webhook.motivo }),
    });
  } catch (error) {
    console.error('Error getting QR code:', error);

    // Antes de marcar como erro, confere o status real no provider: pedir QR
    // logo depois de um "Desconectar" (que só faz logout soft) pode fazer o
    // provider reconectar sozinho pela sessão salva, sem QR nenhum, e sem esta
    // checagem gravaríamos status='error' num canal conectado.
    //
    // Este branch nasceu em 2026-08-31 de uma leitura errada: o texto do erro
    // de `getQrCode()` afirmava "Instance may already be connected" sem ter
    // checado nada, e a frase foi tomada como diagnóstico. A causa real era o
    // base64 lido do campo errado, então o método lançava sempre. O branch
    // segue valendo pelo motivo do parágrafo acima, que é verificado de fato
    // por `getStatus()` — não pelo que a mensagem de erro dizia.
    let alreadyConnected = false;
    try {
      const provider = ChannelProviderFactory.createProvider('whatsapp', channel.provider);
      await provider.initialize({
        channelId: channel.id,
        channelType: 'whatsapp',
        provider: channel.provider,
        externalIdentifier: channel.external_identifier,
        credentials: channel.credentials as Record<string, string>,
      });
      const status = await provider.getStatus();
      alreadyConnected = status.status === 'connected';
    } catch (statusError) {
      console.error('Error re-checking status after QR failure:', statusError);
    }

    if (alreadyConnected) {
      const { error: updateError } = await supabase
        .from('messaging_channels')
        .update({
          status: 'connected',
          status_message: null,
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', channelId);

      if (updateError) {
        console.error('Failed to update channel status to connected:', updateError);
      }

      // Reconexão pela sessão salva não gera QR nenhum, e este branch é o
      // único ponto em que um canal vira 'connected' pela ação do admin — o
      // caminho que mais parece "deu certo" e o que mais precisa do webhook
      // armado. Ele já foi armado lá em cima, antes do provider; aqui só
      // reporta.
      return json({
        alreadyConnected: true,
        webhookConfigured: webhook.armado,
        ...(webhook.armado ? {} : { webhookWarning: webhook.motivo }),
      });
    }

    // Atualizar status do canal para error
    await supabase
      .from('messaging_channels')
      .update({
        status: 'error',
        status_message: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', channelId);

    return json({
      error: error instanceof Error ? error.message : 'Failed to get QR code'
    }, 500);
  }
}
