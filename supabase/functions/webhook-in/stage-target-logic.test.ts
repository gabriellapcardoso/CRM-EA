import { describe, expect, it } from 'vitest';
import { resolveInitialStageId, shouldMoveExistingDeal } from './stage-target-logic';

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
