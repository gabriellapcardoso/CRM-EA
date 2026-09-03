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

    // Arma o webhook ANTES de o admin escanear, nunca depois: quem confirma
    // que o QR foi lido é o `connection.update` que a Evolution manda PRO
    // webhook. Com o webhook desarmado nesse instante, esse evento se perde e
    // o canal nunca sai de waiting_qr — o mesmo deadlock que o filtro de
    // status já causou uma vez (issue #3).
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

    // Antes de marcar como erro, confere o status real no provider. Achado
    // ao vivo em 2026-08-31: pedir QR logo depois de um "Desconectar" (que só
    // faz logout soft) pode fazer o provider reconectar sozinho usando a
    // sessão salva — sem QR nenhum. getQrCode() lança erro nesse caso
    // ("Instance may already be connected"), e sem esta checagem a gente
    // escreveria status='error' num canal que na verdade está conectado.
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

      // Reconexão pela sessão salva não gera QR nenhum, então este branch é o
      // único ponto em que um canal vira 'connected' pela ação do admin. Sem
      // armar aqui, o caminho que mais parece "deu certo" é justamente o que
      // deixa o canal mudo.
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
