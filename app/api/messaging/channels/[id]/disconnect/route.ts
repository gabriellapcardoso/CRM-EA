import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { ChannelProviderFactory } from '@/lib/messaging';
import type { ChannelType } from '@/lib/messaging/types';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/messaging/channels/[id]/disconnect
 *
 * Encerra a sessão do canal no provider de verdade (Evolution: logout da
 * instância; Z-API: disconnect do número) e só então marca o canal como
 * desconectado no banco.
 *
 * O status no banco é sempre atualizado — ele reflete a intenção do admin.
 * O campo `providerDisconnected` na resposta diz se a sessão foi realmente
 * encerrada no provider; quando `false`, `warning` traz o motivo (credencial
 * inválida, servidor fora do ar) pra UI não afirmar que desconectou.
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

  let providerDisconnected = true;
  let warning: string | undefined;

  try {
    const provider = ChannelProviderFactory.createProvider(
      channel.channel_type as ChannelType,
      channel.provider
    );

    await provider.initialize({
      channelId: channel.id,
      channelType: channel.channel_type as ChannelType,
      provider: channel.provider,
      externalIdentifier: channel.external_identifier,
      credentials: channel.credentials as Record<string, string>,
    });

    await provider.disconnect();
  } catch (error) {
    // Falha no provider não impede marcar o canal como desconectado no CRM —
    // senão um canal com credencial quebrada ficaria "conectado" pra sempre.
    // Mas a resposta precisa contar a verdade pro admin.
    providerDisconnected = false;
    warning = error instanceof Error ? error.message : 'Unknown error';
    console.error('[disconnect] provider disconnect failed:', { channelId, error });
  }

  const { error: updateError } = await supabase
    .from('messaging_channels')
    .update({
      status: 'disconnected',
      status_message: warning ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id);

  // Falha aqui não pode virar 500: se o provider já desconectou de verdade,
  // reportar erro pro admin faria ele achar que o canal segue conectado
  // quando a sessão já morreu do lado de fora. Loga sem quebrar a resposta —
  // mesmo padrão de qr-code/route.ts. Mas `persisted:false` avisa o caller
  // que o banco pode não refletir a desconexão real (sem esse campo, o
  // admin veria "Canal desconectado" mesmo com o status antigo no banco).
  const persisted = !updateError;
  if (updateError) {
    console.error('[disconnect] failed to update channel status:', updateError);
  }

  return json({ success: true, providerDisconnected, persisted, warning });
}
