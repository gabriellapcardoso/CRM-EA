import { describe, expect, it } from 'vitest';
import {
  resolveEffectiveBoardId,
  resolveInitialStageId,
  shouldMoveExistingDeal,
} from './stage-target-logic';

describe('shouldMoveExistingDeal', () => {
  it('retorna false quando targetStageId é null (payload sem target_stage_slug — retrocompatibilidade)', () => {
    expect(shouldMoveExistingDeal(null, 'stage-atual')).toBe(false);
  });

  it('retorna false quando o deal já está no estágio-alvo', () => {
    expect(shouldMoveExistingDeal('stage-x', 'stage-x')).toBe(false);
  });

  it('retorna true quando targetStageId difere do estágio atual', () => {
    expect(shouldMoveExistingDeal('stage-novo', 'stage-atual')).toBe(true);
  });

  it('retorna true quando o deal não tem estágio atual conhecido mas há um alvo', () => {
    expect(shouldMoveExistingDeal('stage-novo', null)).toBe(true);
  });
});

describe('resolveInitialStageId', () => {
  it('usa o entry_stage_id da fonte quando não há targetStageId (retrocompatibilidade)', () => {
    expect(resolveInitialStageId(null, 'entry-stage-padrao')).toBe('entry-stage-padrao');
  });

  it('usa o targetStageId quando presente, em vez do estágio de entrada padrão', () => {
    expect(resolveInitialStageId('stage-proposta-enviada', 'entry-stage-padrao')).toBe(
      'stage-proposta-enviada',
    );
  });
});

// Regressão: bug achado no /qa (2026-08-03) — a fonte "Gerador de Propostas"
// também recebe pagamento_recebido (board pós-venda), então usar sempre
// entry_board_id pra procurar/criar deal fazia target_stage_slug (T3b) nunca
// achar o deal certo no board negociação. Confirmado em produção: webhook
// respondia 200 "deal: updated" mas o deal errado (pós-venda) era tocado, e
// o estágio nunca mudava (RPC rejeita mover pra estágio de outro board).
describe('resolveEffectiveBoardId', () => {
  it('usa o entry_board_id da fonte quando não há estágio-alvo resolvido (retrocompatibilidade)', () => {
    expect(resolveEffectiveBoardId(null, 'board-pos-venda')).toBe('board-pos-venda');
  });

  it('usa o board do estágio-alvo em vez do board de entrada da fonte', () => {
    expect(resolveEffectiveBoardId('board-negociacao', 'board-pos-venda')).toBe(
      'board-negociacao',
    );
  });

  it('board do estágio-alvo pode ser igual ao de entrada — segue usando ele sem erro', () => {
    expect(resolveEffectiveBoardId('board-x', 'board-x')).toBe('board-x');
  });
});
