/**
 * Aba Dossiê — comportamento de tela.
 *
 * Três coisas que só o componente decide, e que nenhuma das outras guardas da
 * F4a alcança:
 *
 * 1. **Estado indefinido não pode dizer "não há arquivo".** `isLoading` do
 *    TanStack é `isPending && isFetching`, e existe um quarto estado sem nome:
 *    `pending` sem `fetching` (retry pausado, query desabilitada, entre
 *    tentativas). A condição intuitiva afirma vazio sobre uma consulta que
 *    falhou — foi exatamente o que a tela de Clientes mostrou com a consulta
 *    devolvendo 400. `estadoDaConsulta` resolve isso; este teste guarda que a
 *    aba usa a resposta dela em vez de recombinar booleanos.
 * 2. **O input de arquivo é limpo mesmo quando o envio falha.** Sem isso,
 *    escolher o MESMO arquivo de novo depois de um erro não dispara `change` e
 *    o botão parece morto.
 *
 *    **O que este arquivo NÃO guarda, e a injeção de regressão provou:** a
 *    ORDEM entre `e.target.value = ''` e o `if (!file) return`. Inverter os dois
 *    mantém os 7 testes verdes, porque `userEvent.upload` sempre entrega um
 *    arquivo e o early return nunca dispara. A ordem só tem efeito quando a
 *    pessoa abre o seletor e CANCELA, e esse estado não é montável aqui:
 *    `value` de input de arquivo não é atribuível em happy-dom. Registrado como
 *    limitação conhecida em vez de afirmada como cobertura.
 * 3. **Tipo que o banco aceita e o seletor não oferece aparece com rótulo.**
 *    `gerado` marca arquivo do sistema: sai do seletor de upload de propósito e
 *    tem que continuar legível na tabela.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ClientAsset } from '@/types/clients';

const enviarMock = vi.fn();
const excluirMock = vi.fn();

/** Estado da query do dossiê, trocado por teste. */
let estadoDaQuery: {
    data?: ClientAsset[];
    isSuccess: boolean;
    isError: boolean;
    isFetching: boolean;
    error?: Error;
};

vi.mock('@/lib/query/hooks/useClientsQuery', () => ({
    useClientAssets: () => estadoDaQuery,
    useUploadClientAsset: () => ({ mutateAsync: enviarMock, isPending: false, isError: false }),
    useDeleteClientAsset: () => ({ mutateAsync: excluirMock, isPending: false, isError: false }),
}));

vi.mock('@/lib/supabase/clientAssets', async importOriginal => {
    const real = await importOriginal<typeof import('@/lib/supabase/clientAssets')>();
    return { ...real, clientAssetsService: { ...real.clientAssetsService, urlDeDownload: vi.fn() } };
});

import { DossieTab } from '@/features/clients/detail/DossieTab';

function asset(over: Partial<ClientAsset> = {}): ClientAsset {
    return {
        id: 'a1',
        companyId: 'e1',
        fileName: 'contrato.pdf',
        filePath: 'org-1/e1/uuid.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        kind: 'documento',
        createdAt: '2026-09-24T12:00:00Z',
        ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    estadoDaQuery = { data: [], isSuccess: true, isError: false, isFetching: false };
});

describe('estados da consulta', () => {
    it('estado indefinido NÃO afirma que o dossiê está vazio', () => {
        // `pending` sem `fetching`: nem respondeu, nem falhou.
        estadoDaQuery = { isSuccess: false, isError: false, isFetching: false };
        render(<DossieTab companyId="e1" />);

        expect(screen.getByText(/não chegou/i)).toBeInTheDocument();
        expect(screen.queryByText(/nenhum arquivo no dossiê/i)).not.toBeInTheDocument();
    });

    it('vazio de verdade só aparece depois de a consulta responder', () => {
        estadoDaQuery = { data: [], isSuccess: true, isError: false, isFetching: false };
        render(<DossieTab companyId="e1" />);

        expect(screen.getByText(/nenhum arquivo no dossiê/i)).toBeInTheDocument();
        expect(screen.queryByText(/não chegou/i)).not.toBeInTheDocument();
    });

    it('erro mostra o motivo, não "vazio"', () => {
        estadoDaQuery = {
            isSuccess: false,
            isError: true,
            isFetching: false,
            error: new Error('permissão negada'),
        };
        render(<DossieTab companyId="e1" />);

        expect(screen.getByText(/permissão negada/i)).toBeInTheDocument();
        expect(screen.queryByText(/nenhum arquivo no dossiê/i)).not.toBeInTheDocument();
    });
});

describe('vocabulário na tela', () => {
    it('tipo que o seletor não oferece aparece com rótulo, não cru', () => {
        estadoDaQuery = {
            data: [asset({ kind: 'gerado', fileName: 'relatorio.pdf' })],
            isSuccess: true,
            isError: false,
            isFetching: false,
        };
        render(<DossieTab companyId="e1" />);

        expect(screen.getByText('Gerado pelo Sistema')).toBeInTheDocument();
        expect(screen.queryByText('gerado')).not.toBeInTheDocument();
    });

    it('o seletor de upload não oferece `gerado`', () => {
        render(<DossieTab companyId="e1" />);
        const seletor = screen.getByLabelText(/tipo do arquivo a enviar/i);
        const opcoes = [...seletor.querySelectorAll('option')].map(o => o.getAttribute('value'));

        expect(opcoes).toContain('documento');
        expect(opcoes).toContain('contrato');
        expect(opcoes).not.toContain('gerado');
    });
});

describe('escolher arquivo', () => {
    it('limpa o input mesmo quando o envio falha, pra o mesmo arquivo poder ser reescolhido', async () => {
        enviarMock.mockRejectedValueOnce(new Error('policy'));
        render(<DossieTab companyId="e1" />);

        const input = screen.getByLabelText(/escolher arquivo do dossiê/i) as HTMLInputElement;
        const arquivo = new File(['x'], 'briefing.pdf', { type: 'application/pdf' });
        await userEvent.upload(input, arquivo);

        await waitFor(() => expect(enviarMock).toHaveBeenCalled());
        expect(
            input.value,
            'o input ficou com o arquivo — reescolher o mesmo não dispara change e o botão parece morto',
        ).toBe('');
    });

    it('envia o tipo selecionado junto com o arquivo', async () => {
        enviarMock.mockResolvedValueOnce({});
        render(<DossieTab companyId="e1" />);

        const input = screen.getByLabelText(/escolher arquivo do dossiê/i) as HTMLInputElement;
        await userEvent.upload(input, new File(['x'], 'a.pdf', { type: 'application/pdf' }));

        await waitFor(() => expect(enviarMock).toHaveBeenCalled());
        expect(enviarMock.mock.calls[0][0]).toMatchObject({ companyId: 'e1', kind: 'documento' });
    });
});
