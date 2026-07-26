/**
 * @fileoverview WhatsApp opt-out footer (T4)
 *
 * Anexa o aviso de opt-out (LGPD) só na 1ª mensagem outbound de uma
 * conversa de WhatsApp — nunca nas seguintes. Chamado de dentro de
 * ChannelRouterService.sendMessage(), mesmo choke point único do
 * whatsapp-send-guard (ver T4-EXECUCAO.md).
 *
 * @module lib/messaging/whatsapp-optout-footer
 */

import { createStaticAdminClient } from '@/lib/supabase/server';

export const WHATSAPP_OPT_OUT_FOOTER =
  'Se preferir não receber mais mensagens, responda SAIR a qualquer momento.';

/**
 * True se esta conversa ainda não teve nenhuma mensagem outbound
 * efetivamente entregue ao provider — ou seja, a próxima seria a 1ª.
 * Usa status sent/delivered/read (não draft/pending/queued/failed) pra não
 * duplicar o rodapé nem pular ele por causa de tentativa falha anterior.
 */
export async function isFirstOutboundMessage(conversationId: string): Promise<boolean> {
  const supabase = createStaticAdminClient();

  const { count, error } = await supabase
    .from('messaging_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .in('status', ['sent', 'delivered', 'read']);

  if (error) {
    console.error('[whatsapp-optout-footer] isFirstOutboundMessage error:', error);
    return false; // na dúvida, não duplica o rodapé
  }

  return (count ?? 0) === 0;
}

/**
 * Retorna o texto com o rodapé de opt-out anexado se for a 1ª mensagem
 * outbound da conversa; caso contrário retorna o texto original.
 */
export async function withOptOutFooterIfFirstMessage(
  conversationId: string,
  text: string
): Promise<string> {
  const isFirst = await isFirstOutboundMessage(conversationId);
  return isFirst ? `${text}\n\n${WHATSAPP_OPT_OUT_FOOTER}` : text;
}
