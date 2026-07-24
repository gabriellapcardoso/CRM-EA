/**
 * @fileoverview WhatsApp send guard (T4)
 *
 * Ponto único de enforcement de supressão (LGPD) + kill switch pro canal
 * WhatsApp. Chamado de dentro de ChannelRouterService.sendMessage() —
 * único choke point de envio confirmado no /plan-eng-review (2026-07-23):
 * UI, retry e agente IA passam todos por ele. Ver T4-EXECUCAO.md.
 *
 * @module lib/messaging/whatsapp-send-guard
 */

import { createStaticAdminClient } from '@/lib/supabase/server';

export interface WhatsAppSendGuardResult {
  allowed: boolean;
  reasonCode?: 'KILL_SWITCH_ACTIVE' | 'SUPPRESSED';
  reasonMessage?: string;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Checa kill switch da org e lista de supressão antes de qualquer envio de
 * WhatsApp. `to` é o identificador usado pelo provider (pode vir com ou sem
 * `+`/formatação) — comparação é sempre por dígitos.
 */
export async function checkWhatsAppSendGuard(
  organizationId: string,
  to: string
): Promise<WhatsAppSendGuardResult> {
  const supabase = createStaticAdminClient();

  const { data: settings } = await supabase
    .from('organization_settings')
    .select('whatsapp_kill_switch_active')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (settings?.whatsapp_kill_switch_active) {
    return {
      allowed: false,
      reasonCode: 'KILL_SWITCH_ACTIVE',
      reasonMessage: 'Envio de WhatsApp desativado (kill switch ativo para a organização).',
    };
  }

  const toDigits = onlyDigits(to);
  if (!toDigits) {
    // Sem telefone pra checar (ex.: reação/edição de mensagem existente) — nada a bloquear aqui.
    return { allowed: true };
  }

  const { data: suppressed } = await supabase
    .from('whatsapp_suppression_list')
    .select('phone_e164')
    .eq('organization_id', organizationId)
    .limit(2000);

  const isSuppressed = (suppressed ?? []).some(
    (row) => onlyDigits(row.phone_e164 ?? '') === toDigits
  );

  if (isSuppressed) {
    return {
      allowed: false,
      reasonCode: 'SUPPRESSED',
      reasonMessage: 'Este número está na lista de supressão (opt-out) — envio bloqueado.',
    };
  }

  return { allowed: true };
}
