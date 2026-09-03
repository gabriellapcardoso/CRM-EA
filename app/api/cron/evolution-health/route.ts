import { Resend } from 'resend';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { getChannelRouter } from '@/lib/messaging';
import { lerWebhookDoCanal } from '@/lib/messaging/arm-channel-webhook';
import { autenticaCron } from '@/lib/security/cronAuth';
import { comLimiteDeConcorrencia } from '@/lib/utils/concurrency';

export const maxDuration = 60;

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * GET /api/cron/evolution-health
 *
 * Health-check da sessão Evolution API (T4 — PLANO-NOVO-FLUXO.md /
 * T4-EXECUCAO.md item 4). QR expirado ≠ VPS caída: sem isso, a sessão pode
 * cair silenciosamente e leads viram "Perdido" por falta de resposta.
 *
 * Agendado por **pg_cron**, não pelo vercel.json: o plano Vercel deste projeto
 * é Hobby, que permite no máximo 2 cron jobs e só cadência diária. Ver
 * `supabase/migrations/20260901180000_pg_cron_health_checks.sql` — a cadência
 * real mora lá, e este comentário não a repete de propósito.
 *
 * Grava em security_alerts (auditoria) E manda e-mail de verdade — não basta
 * logar em tabela que ninguém olha às 2h da sexta. E-mail não depende do canal
 * WhatsApp que pode estar fora do ar.
 *
 * Este comentário já disse "a cada 30min" enquanto o vercel.json agendava
 * `0 9 * * *`, uma vez por dia: um canal caindo às 10h ficava 23h sem alerta e
 * o cooldown de 4h abaixo não fazia sentido nenhum. Corrigido em 2026-09-01
 * junto do health check de IA (issue #16).
 *
 * Aviso que vale pros dois crons: sem `organization_settings.alert_email`
 * preenchido, o bloco de e-mail lá embaixo é pulado em silêncio e isto vira
 * exatamente a "tabela que ninguém olha" que o parágrafo acima condena. Foi o
 * que aconteceu por 30 dias: 4 alertas gravados, zero e-mails enviados.
 *
 * Protegido por CRON_SECRET, mesmo padrão de template-sync.
 *
 * Checa DUAS coisas, porque durante 5 semanas checou só uma e reportou verde o
 * tempo todo: a sessão do WhatsApp da aaagência estava genuinamente `open`
 * enquanto o webhook do mesmo canal estava desabilitado, sem eventos e sem
 * header de auth. Nada entrava no CRM e nenhum alerta disparou, porque a
 * pergunta feita aqui ("o WhatsApp está conectado?") tinha resposta sim. A
 * pergunta que faltava é "o que a Evolution recebe chega até nós?".
 *
 * Mesma lição que o `ai-health` já carrega: health check tem que passar pelo
 * caminho por onde o dado realmente anda, não pelo pedaço mais fácil de medir.
 */
export async function GET(req: Request) {
  if (!autenticaCron(req)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createStaticAdminClient();
  const router = getChannelRouter();

  // Só canais que a operadora já considera conectados — evita ruído em canal
  // desconectado de propósito (nunca configurado, desligado manualmente).
  const { data: channels, error: channelsError } = await supabase
    .from('messaging_channels')
    .select('id, organization_id, name, external_identifier, channel_type, provider, credentials')
    .eq('provider', 'evolution')
    .eq('channel_type', 'whatsapp')
    .eq('status', 'connected')
    .is('deleted_at', null);

  if (channelsError) {
    console.error('[Cron:evolution-health] Failed to fetch channels:', channelsError);
    return json({ error: 'Failed to fetch channels' }, 500);
  }

  // Cooldown entre alertas do mesmo canal — sem isso, um canal caído às 2h da
  // sexta manda um e-mail a cada 30min até alguém acordar e resolver (spam
  // que faz o alerta real se perder no meio do ruído). O cooldown é por tipo
  // de alerta: canal caído e webhook desarmado são problemas diferentes, com
  // conserto diferente, e um não deve calar o outro.
  const ALERT_COOLDOWN_HOURS = 4;

  let checked = 0;
  let alerted = 0;

  async function alertar(
    channel: { id: string; organization_id: string; name: string },
    alertType: 'evolution_disconnected' | 'evolution_webhook_inactive',
    title: string,
    description: string,
    details: Record<string, unknown>,
    comoResolver: string,
  ): Promise<void> {
    const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentAlert } = await supabase
      .from('security_alerts')
      .select('id')
      .eq('organization_id', channel.organization_id)
      .eq('alert_type', alertType)
      .contains('details', { channel_id: channel.id })
      .gte('created_at', cooldownSince)
      .limit(1)
      .maybeSingle();

    if (recentAlert) return; // já alertou esse canal recentemente, não repete

    alerted++;

    await supabase.from('security_alerts').insert({
      organization_id: channel.organization_id,
      alert_type: alertType,
      severity: 'critical',
      title,
      description,
      details: { ...details, channel_id: channel.id, checked_at: new Date().toISOString() },
    });

    const { data: settings } = await supabase
      .from('organization_settings')
      .select('alert_email')
      .eq('organization_id', channel.organization_id)
      .maybeSingle();

    if (!settings?.alert_email) {
      // Sem destino configurado o alerta morre aqui em silêncio — foi o que
      // aconteceu por 30 dias, 4 quedas gravadas e zero e-mails. Grita no log.
      console.error(
        `[Cron:evolution-health] alert_email vazio para a org ${channel.organization_id} — alerta "${title}" gravado mas NÃO enviado`,
      );
      return;
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('[Cron:evolution-health] RESEND_API_KEY ausente — alerta gravado mas NÃO enviado');
      return;
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.ALERT_EMAIL_FROM ?? 'alertas@aaagencia.com.br',
        to: settings.alert_email,
        subject: `[CRM] ${title}`,
        text: `${description}\n\n${comoResolver}`,
      });
    } catch (err) {
      console.error('[Cron:evolution-health] Failed to send alert email:', err);
    }
  }

  await comLimiteDeConcorrencia(
    (channels ?? []).map((channel) => async () => {
      checked++;
      const status = await router.getChannelStatus(channel.id);

      if (status.status !== 'connected') {
        await alertar(
          channel,
          'evolution_disconnected',
          `Canal WhatsApp desconectado: ${channel.name}`,
          `A instância Evolution "${channel.external_identifier}" está com status "${status.status}" (esperado: connected). Mensagens novas não estão saindo.`,
          { status: status.status },
          `Acesse o CRM e reconecte o canal (Configurações → Canais → ${channel.name}).`,
        );
        // Canal caído já é o problema maior; webhook de canal desconectado não
        // entrega de qualquer jeito e alertar os dois vira ruído.
        return;
      }

      // Conectado não quer dizer que chega alguma coisa aqui. Este é o check
      // que faltava: a sessão pode estar `open` com o webhook desabilitado, e
      // foi assim que o canal da aaagência passou 5 semanas mudo sem alertar.
      const webhook = await lerWebhookDoCanal(channel);

      if (!webhook.suportado || webhook.saudavel) return;

      const config = webhook.config;
      const problemas: string[] = [];
      if (webhook.motivo) {
        problemas.push(`não foi possível ler a config do webhook (${webhook.motivo})`);
      } else if (config) {
        if (!config.enabled) problemas.push('webhook desabilitado');
        if (config.url !== webhook.urlEsperada) problemas.push(`URL divergente (gravada: ${config.url ?? 'nenhuma'})`);
        if (config.events.length === 0) problemas.push('nenhum evento assinado');
        if (!config.hasAuthHeader) problemas.push('sem header x-api-key (a Edge Function é default-deny e vai recusar)');
      }

      await alertar(
        channel,
        'evolution_webhook_inactive',
        `WhatsApp conectado mas sem receber: ${channel.name}`,
        `A instância Evolution "${channel.external_identifier}" está conectada, mas o webhook não entrega mensagem nenhuma pro CRM: ${problemas.join('; ')}.`,
        { problemas, expected_url: webhook.urlEsperada },
        `Configurações → Canais → ${channel.name} → reconfigurar webhook (ou POST /api/messaging/channels/${channel.id}/webhook).`,
      );
    }),
    10,
  );

  console.log(`[Cron:evolution-health] Done — checked: ${checked}, alerted: ${alerted}`);
  return json({ checked, alerted });
}
