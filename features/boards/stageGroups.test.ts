import { describe, it, expect } from 'vitest';

import { buildStageGroupMap, dealStageGroup, stageGroupOf } from './stageGroups';
import type { BoardStage } from '@/types';

/** Os 14 estágios reais do board "Negociação" (migration T1b, 2026-08-03). */
const NEGOCIACAO_LABELS = [
  'Novo',
  'Contato',
  'Negociando',
  'Topou receber proposta',
  'Proposta enviada',
  'Proposta aceita',
  'Rodar contrato',
  'Enviar contrato',
  'Contrato aprovado',
  'Contrato assinado',
  'Pagamento recebido',
  'Ganho',
  'Onboarding',
  'Perdido',
];

function makeStages(labels: string[]): BoardStage[] {
  return labels.map((label, i) => ({ id: `s${i}`, label, color: '' }));
}

describe('stageGroups', () => {
  it('mapeia os 14 estágios reais do board Negociação para os 5 grupos do handoff', () => {
    const stages = makeStages(NEGOCIACAO_LABELS);
    const map = buildStageGroupMap(stages, null);

    expect(stages.map(s => map.get(s.id))).toEqual([
      'frio',
      'frio',
      'frio',
      'proposta',
      'proposta',
      'proposta',
      'contrato',
      'contrato',
      'contrato',
      'contrato',
      'ganho',
      'ganho',
      'ganho',
      'perdido',
    ]);
  });

  it('respeita wonStageId/lostStageId declarados no board', () => {
    const stages = makeStages(['Etapa A', 'Etapa B', 'Etapa C']);
    const map = buildStageGroupMap(stages, { wonStageId: 's1', lostStageId: 's2' });

    expect(map.get('s1')).toBe('ganho');
    expect(map.get('s2')).toBe('perdido');
  });

  it('cai no fallback posicional quando o label não é reconhecido', () => {
    const stages = makeStages(['Etapa A', 'Etapa B', 'Etapa C', 'Etapa D', 'Etapa E']);
    const groups = stages.map((s, i) => stageGroupOf(s, i, stages.length));

    expect(groups[0]).toBe('frio');
    expect(groups[groups.length - 1]).toBe('ganho');
  });

  it('deal ganho/perdido sobrepõe o grupo do estágio (won/lostStayInStage)', () => {
    const map = buildStageGroupMap(makeStages(NEGOCIACAO_LABELS), null);

    expect(dealStageGroup({ status: 's0', isWon: true }, map)).toBe('ganho');
    expect(dealStageGroup({ status: 's0', isLost: true }, map)).toBe('perdido');
    expect(dealStageGroup({ status: 's0' }, map)).toBe('frio');
  });
});
