import { describe, expect, it } from 'vitest';
import { matchesOptOutKeyword } from './opt-out-parser';

describe('matchesOptOutKeyword', () => {
  it('detects exact keyword "sair"', () => {
    expect(matchesOptOutKeyword('sair')).toBe(true);
  });

  it('detects exact keyword "parar"', () => {
    expect(matchesOptOutKeyword('parar')).toBe(true);
  });

  it('detects exact keyword "descadastrar"', () => {
    expect(matchesOptOutKeyword('descadastrar')).toBe(true);
  });

  it('detects exact keyword "stop"', () => {
    expect(matchesOptOutKeyword('stop')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesOptOutKeyword('SAIR')).toBe(true);
    expect(matchesOptOutKeyword('Parar')).toBe(true);
  });

  it('matches keyword at start of a longer phrase', () => {
    expect(matchesOptOutKeyword('sair por favor, não quero mais receber')).toBe(true);
    expect(matchesOptOutKeyword('parar de enviar mensagens pra mim')).toBe(true);
  });

  it('ignores leading/trailing whitespace', () => {
    expect(matchesOptOutKeyword('  stop  ')).toBe(true);
  });

  it('does not match keyword in the middle of a phrase', () => {
    expect(matchesOptOutKeyword('quero saber se vocês vão parar de me ligar')).toBe(false);
  });

  it('does not match unrelated messages', () => {
    expect(matchesOptOutKeyword('oi, tudo bem?')).toBe(false);
    expect(matchesOptOutKeyword('quero saber mais sobre o serviço')).toBe(false);
  });

  it('does not match a word that merely starts with a keyword', () => {
    expect(matchesOptOutKeyword('stopwatch é um app legal')).toBe(false);
    expect(matchesOptOutKeyword('pararaio quebrou')).toBe(false);
  });

  it('returns false for empty or whitespace-only input', () => {
    expect(matchesOptOutKeyword('')).toBe(false);
    expect(matchesOptOutKeyword('   ')).toBe(false);
  });
});
