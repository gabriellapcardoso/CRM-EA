import { describe, expect, it } from 'vitest';
import { estadoDaConsulta, type EntradaDaConsulta } from './estadoDaConsulta';

const base: EntradaDaConsulta = {
    isSuccess: false,
    isError: false,
    isFetching: false,
    temDados: false,
    quantidade: 0,
};

describe('estadoDaConsulta', () => {
    /**
     * O caso que motivou a função. Achado no navegador em 2026-09-05: a
     * consulta devolveu 400, o TanStack pausou o retry (`fetchStatus:
     * 'paused'`), e com isso `isLoading` virou false e `isError` continuou
     * false. A tela dizia "nenhum cliente cadastrado ainda" sobre uma consulta
     * que nunca respondeu.
     */
    it('retry pausado não vira "não há nada"', () => {
        expect(estadoDaConsulta({ ...base })).toBe('indefinido');
    });

    it('query desabilitada (sessão ainda resolvendo) também é indefinido', () => {
        expect(estadoDaConsulta({ ...base, isFetching: false })).toBe('indefinido');
    });

    it('só afirma vazio depois de resposta', () => {
        expect(estadoDaConsulta({ ...base, isSuccess: true })).toBe('vazio');
        expect(estadoDaConsulta({ ...base, isSuccess: true, temFiltro: true })).toBe(
            'vazio-por-filtro',
        );
    });

    it('carregando exige estar buscando E não ter nada em mãos', () => {
        expect(estadoDaConsulta({ ...base, isFetching: true })).toBe('carregando');
        // Rebusca em segundo plano com página anterior na tela: continua
        // mostrando os dados, não um "carregando" que apaga a lista.
        expect(
            estadoDaConsulta({
                ...base,
                isSuccess: true,
                isFetching: true,
                temDados: true,
                quantidade: 3,
            }),
        ).toBe('com-dados');
    });

    it('erro vence a rebusca em curso', () => {
        expect(estadoDaConsulta({ ...base, isError: true, isFetching: true })).toBe('erro');
    });

    it('com dados, quantidade manda', () => {
        expect(
            estadoDaConsulta({ ...base, isSuccess: true, temDados: true, quantidade: 1 }),
        ).toBe('com-dados');
    });
});
