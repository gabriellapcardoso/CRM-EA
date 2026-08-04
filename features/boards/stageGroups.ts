/**
 * @fileoverview Agrupamento visual de estágios (redesign 2026-08).
 *
 * O handoff de design (`card-deal.css`/`board.css`) trabalha com apenas 5 grupos
 * de cor — `frio`, `proposta`, `contrato`, `ganho`, `perdido` — expostos como
 * `--stage-*` em `app/globals.css`. O board real ("Negociação") tem 14 estágios
 * (migration `20260803100000_t1b_negociacao_board_fluxo_completo.sql`), então
 * este módulo faz a ponte entre os dois.
 *
 * Ordem de resolução (do mais confiável para o mais genérico):
 * 1. Estágios de ganho/perda declarados no board (`wonStageId`/`lostStageId`).
 * 2. Nome/label normalizado (sem acento, minúsculo) — cobre os 14 estágios reais.
 * 3. Posição relativa do estágio no board — fallback para boards customizados.
 *
 * @module features/boards/stageGroups
 */

import type { Board, BoardStage } from '@/types';

export type StageGroup = 'frio' | 'proposta' | 'contrato' | 'ganho' | 'perdido';

/** Remove acentos e normaliza para comparação de label. */
function normalizeLabel(label: string | undefined | null): string {
  return (label ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Mapa label normalizado → grupo, cobrindo os 14 estágios do board Negociação
 * mais os labels legados (`contatado`, `topou proposta`) que ainda existem em
 * bases antigas.
 */
const LABEL_TO_GROUP: Array<[RegExp, StageGroup]> = [
  [/^perdid/, 'perdido'],
  [/^ganho|^ganha|^fechado ganho|^won/, 'ganho'],
  [/pagamento recebido|^onboarding|^cliente ativo/, 'ganho'],
  [/contrato/, 'contrato'],
  [/proposta/, 'proposta'],
  [/^novo|^nova|^lead|^contato|^contatado|^negociando|^negociacao|^qualifica/, 'frio'],
];

/**
 * Fallback posicional: divide o board em faixas quando o label não é reconhecido.
 * Últimos estágios tendem a ser fechamento; primeiros, topo de funil.
 */
function groupByPosition(index: number, total: number): StageGroup {
  if (total <= 1) return 'frio';
  const ratio = index / (total - 1);
  if (ratio >= 0.85) return 'ganho';
  if (ratio >= 0.6) return 'contrato';
  if (ratio >= 0.3) return 'proposta';
  return 'frio';
}

/**
 * Resolve o grupo de cor de um estágio do board.
 *
 * @param stage Estágio do board.
 * @param index Posição do estágio na lista (0-based).
 * @param total Quantidade total de estágios do board.
 * @param board Board dono do estágio (opcional — usado para won/lost explícitos).
 */
export function stageGroupOf(
  stage: Pick<BoardStage, 'id' | 'label'>,
  index: number,
  total: number,
  board?: Pick<Board, 'wonStageId' | 'lostStageId'> | null
): StageGroup {
  if (board?.lostStageId && board.lostStageId === stage.id) return 'perdido';
  if (board?.wonStageId && board.wonStageId === stage.id) return 'ganho';

  const label = normalizeLabel(stage.label);
  for (const [pattern, group] of LABEL_TO_GROUP) {
    if (pattern.test(label)) return group;
  }

  return groupByPosition(index, total);
}

/**
 * Constrói o índice `stageId → grupo` de um board inteiro (O(S), uma vez).
 */
export function buildStageGroupMap(
  stages: BoardStage[],
  board?: Pick<Board, 'wonStageId' | 'lostStageId'> | null
): Map<string, StageGroup> {
  const map = new Map<string, StageGroup>();
  stages.forEach((stage, index) => {
    map.set(stage.id, stageGroupOf(stage, index, stages.length, board));
  });
  return map;
}

/**
 * Grupo de um deal — respeita `isWon`/`isLost` (que podem "arquivar" o deal no
 * próprio estágio, sem movê-lo, quando `wonStayInStage`/`lostStayInStage`).
 */
export function dealStageGroup(
  deal: { status: string; isWon?: boolean; isLost?: boolean },
  stageGroups: Map<string, StageGroup>
): StageGroup {
  if (deal.isLost) return 'perdido';
  if (deal.isWon) return 'ganho';
  return stageGroups.get(deal.status) ?? 'frio';
}
