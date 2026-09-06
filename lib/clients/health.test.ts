import { describe, expect, it } from 'vitest';
import { faixaDeSaude, rotuloDaFaixa } from './health';

describe('faixaDeSaude', () => {
    it.each([
        [100, 'promotor'],
        [80, 'promotor'],
        [79, 'satisfeito'],
        [60, 'satisfeito'],
        [59, 'neutro'],
        [30, 'neutro'],
        [29, 'detrator'],
        [10, 'detrator'],
        [9, 'churn'],
        [0, 'churn'],
    ])('classifica %i como %s', (score, esperado) => {
        expect(faixaDeSaude(score)).toBe(esperado);
    });

    // Cliente recém-cadastrado ainda não foi avaliado, e isso é diferente de
    // zero, que significa churn. Devolver 'churn' pra ausência classificaria
    // como perdido todo cliente novo — e o filtro de churn passaria a pescar
    // a carteira inteira que ninguém pontuou ainda.
    it('devolve null quando não há pontuação, sem confundir com churn', () => {
        expect(faixaDeSaude(undefined)).toBeNull();
        expect(faixaDeSaude(null)).toBeNull();
        expect(faixaDeSaude(Number.NaN)).toBeNull();
        expect(faixaDeSaude(0)).toBe('churn');
    });

    it('devolve null fora de 0..100', () => {
        expect(faixaDeSaude(101)).toBeNull();
        expect(faixaDeSaude(-1)).toBeNull();
    });

    it('rotula a ausência de avaliação sem inventar faixa', () => {
        expect(rotuloDaFaixa(null)).toBe('Sem avaliação');
        expect(rotuloDaFaixa('promotor')).toBe('Promotor');
    });
});
