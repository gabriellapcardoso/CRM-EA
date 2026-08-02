/**
 * T3b — lógica pura de decisão de estágio-alvo para o webhook-in genérico.
 *
 * Extraída do handler principal (index.ts, que importa `npm:@supabase/supabase-js`
 * e não roda em Vitest/Node) para poder ser testada sem um runtime Deno —
 * mesmo padrão já usado em deal-stage-dispatcher/dispatcher-logic.ts e
 * messaging-webhook-evolution/opt-out-parser.ts.
 *
 * `targetStageId` aqui é sempre o resultado (já resolvido e validado) da RPC
 * `resolve_negociacao_stage_id` — null quando o payload não trouxe
 * `target_stage_slug`, ou quando o slug não corresponde a nenhum estágio
 * real do board "negociação" da org.
 */

/**
 * Decide se um deal JÁ EXISTENTE deve ser movido de estágio.
 *
 * Retrocompatibilidade: quando `targetStageId` é null (payload antigo, sem
 * `target_stage_slug`, ou slug não resolvido), retorna sempre false — o
 * deal mantém o estágio atual, exatamente como o webhook-in se comportava
 * antes do T3b.
 */
export function shouldMoveExistingDeal(
  targetStageId: string | null,
  currentStageId: string | null,
): boolean {
  if (!targetStageId) return false;
  return targetStageId !== currentStageId;
}

/**
 * Decide o estágio inicial de um deal RECÉM-CRIADO.
 *
 * Retrocompatibilidade: sem `targetStageId` resolvido, cai no estágio de
 * entrada configurado na fonte (`entry_stage_id`) — comportamento inalterado
 * pra qualquer integração que não manda `target_stage_slug`.
 */
export function resolveInitialStageId(
  targetStageId: string | null,
  entryStageId: string,
): string {
  return targetStageId ?? entryStageId;
}
