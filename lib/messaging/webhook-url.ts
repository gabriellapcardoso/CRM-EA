/**
 * @fileoverview Fonte única da URL de webhook de um canal de mensageria.
 *
 * A URL existia duplicada em dois componentes de settings, cada um com seu
 * mapa de provider → Edge Function, e em nenhum lugar do servidor — porque
 * até 2026-09-03 nada no app configurava webhook: as telas só mostravam a URL
 * pro admin copiar e colar no painel do provider.
 *
 * Esse copia-e-cola foi a causa raiz de o WhatsApp da aaagência ficar 5
 * semanas mudo: a URL foi colada certa no painel da Evolution, mas com
 * `enabled: false`, `events: []` e sem o header de auth — três campos que o
 * painel deixa em branco por padrão e que ninguém tinha como saber que
 * faltavam, porque nada no CRM reclama. Ver `DESAFIOS.md`.
 *
 * Agora o servidor arma o webhook sozinho (`configureWebhook`), e precisa da
 * mesma URL que as telas mostram. Duas cópias já tinham divergido de forma
 * silenciosa (uma monta por project ref, a outra pela URL inteira); uma
 * terceira, no servidor, viraria a divergência que quebra de verdade.
 *
 * @module lib/messaging/webhook-url
 */

/** Edge Function que recebe o webhook de cada provider. */
export const WEBHOOK_FUNCTION_BY_PROVIDER: Record<string, string> = {
  'z-api': 'messaging-webhook-zapi',
  evolution: 'messaging-webhook-evolution',
  'meta-cloud': 'messaging-webhook-meta',
  meta: 'messaging-webhook-meta',
  resend: 'messaging-webhook-resend',
};

/** Fallback histórico das telas de settings quando o provider é desconhecido. */
const DEFAULT_WEBHOOK_FUNCTION = 'messaging-webhook-zapi';

export function webhookFunctionForProvider(provider: string): string {
  return WEBHOOK_FUNCTION_BY_PROVIDER[provider] ?? DEFAULT_WEBHOOK_FUNCTION;
}

/**
 * Monta a URL pública do webhook de um canal.
 *
 * Devolve `null` quando não dá pra montar uma URL válida — nunca uma string
 * quebrada. Armar `undefined/functions/v1/...` no servidor do provider é pior
 * que não armar nada: o painel passa a mostrar um webhook "configurado" que
 * nunca vai entregar, que é exatamente o estado que este módulo existe pra
 * impedir.
 */
export function buildChannelWebhookUrl(
  provider: string,
  channelId: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!supabaseUrl || !channelId) return null;

  let origin: string;
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {
    return null;
  }

  return `${origin}/functions/v1/${webhookFunctionForProvider(provider)}/${channelId}`;
}
