import { Resend } from 'resend';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { getChannelRouter } from '@/lib/messaging';

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
 * Roda a cada 15min (ver vercel.json). Grava em security_alerts (auditoria)
 * E manda e-mail de verdade — não basta logar em tabela que ninguém olha às
 * 2h da sexta. E-mail não depende do canal WhatsApp que pode estar fora do ar.
 *
 * Este comentário dizia "a cada 30min" enquanto o vercel.json agendava
 * `0 9 * * *` — uma vez por dia. Um canal que caísse às 10h ficava 23h sem
 * alerta, e o cooldown de 4h abaixo não fazia sentido nenhum nessa cadência.
 * Alinhado em 2026-09-01 junto do health check de IA (issue #16).
 *
 * Aviso que vale pros dois crons: sem `organization_settings.alert_email`
 * preenchido, o bloco de e-mail lá embaixo é pulado em silêncio e isto vira
 * exatamente a "tabela que ninguém olha" que o parágrafo acima condena. Foi o
 * que aconteceu por 30 dias: 4 alertas gravados, zero e-mails enviados.
 *
 * Protegido por CRON_SECRET, mesmo padrão de template-sync.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createStaticAdminClient();
  const router = getChannelRouter();

  // Só canais que a operadora já considera conectados — evita ruído em canal
  // desconectado de propósito (nunca configurado, desligado manualmente).
  const { data: channels, error: channelsError } = await supabase
    .from('messaging_channels')
    .select('id, organization_id, name, external_identifier')
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
  // que faz o alerta real se perder no meio do ruído).
  const ALERT_COOLDOWN_HOURS = 4;

  let checked = 0;
  let alerted = 0;

  await Promise.allSettled(
    (channels ?? []).map(async (channel) => {
      checked++;
      const status = await router.getChannelStatus(channel.id);

      if (status.status === 'connected') return;

      const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const { data: recentAlert } = await supabase
        .from('security_alerts')
        .select('id')
        .eq('organization_id', channel.organization_id)
        .eq('alert_type', 'evolution_disconnected')
        .contains('details', { channel_id: channel.id })
        .gte('created_at', cooldownSince)
        .limit(1)
        .maybeSingle();

      if (recentAlert) return; // já alertou esse canal recentemente, não repete

      alerted++;
      const title = `Canal WhatsApp desconectado: ${channel.name}`;
      const description = `A instância Evolution "${channel.external_identifier}" está com status "${status.status}" (esperado: connected). Mensagens novas não estão saindo.`;

      await supabase.from('security_alerts').insert({
        organization_id: channel.organization_id,
        alert_type: 'evolution_disconnected',
        severity: 'critical',
        title,
        description,
        details: { channel_id: channel.id, status: status.status, checked_at: new Date().toISOString() },
      });

      const { data: settings } = await supabase
        .from('organization_settings')
        .select('alert_email')
        .eq('organization_id', channel.organization_id)
        .maybeSingle();

      if (settings?.alert_email && process.env.RESEND_API_KEY) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: process.env.ALERT_EMAIL_FROM ?? 'alertas@aaagencia.com.br',
            to: settings.alert_email,
            subject: `[CRM] ${title}`,
            text: `${description}\n\nAcesse o CRM e reconecte o canal (Configurações → Canais → ${channel.name}).`,
          });
        } catch (err) {
          console.error('[Cron:evolution-health] Failed to send alert email:', err);
        }
      }
    })
  );

  console.log(`[Cron:evolution-health] Done — checked: ${checked}, alerted: ${alerted}`);
  return json({ checked, alerted });
}
