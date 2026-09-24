/**
 * Exclusão de arquivo do dossiê: ordem e erro não engolido.
 *
 * Duas coisas podem falhar — apagar os bytes e apagar a linha — e a ordem
 * decide qual sobra quando uma delas falha:
 *
 * - bytes primeiro: se o Storage falha, nada é apagado e a pessoa vê o erro;
 *   se o Storage apaga e a linha não, sobra linha apontando pra arquivo que não
 *   existe — visível na tela e resolvível clicando em excluir de novo.
 * - linha primeiro: se o Storage falha depois, sobra BYTE órfão — invisível pra
 *   qualquer consulta do produto e fora do alcance de qualquer pedido de
 *   eliminação. É o que o `dealFiles.ts` produz hoje, porque ele faz
 *   `console.warn` no erro do Storage e apaga a linha assim mesmo.
 *
 * O terceiro caso é o `signed_asset_id`: a FK é `ON DELETE SET NULL`, então
 * apagar o contrato assinado zeraria o vínculo do contrato em silêncio.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

type Chamada = { alvo: string; metodo: string; args: unknown[] };

function montarMock(opcoes: {
    contratosVinculados?: { id: string }[];
    erroDoStorage?: Error | null;
    erroDoDelete?: Error | null;
    erroDaConsultaDeVinculo?: Error | null;
}) {
    const chamadas: Chamada[] = [];

    const remove = vi.fn((caminhos: string[]) => {
        chamadas.push({ alvo: 'storage', metodo: 'remove', args: [caminhos] });
        return Promise.resolve({ data: null, error: opcoes.erroDoStorage ?? null });
    });

    function tabela(nome: string) {
        const b: Record<string, unknown> = {};
        const registrar = (metodo: string) =>
            vi.fn((...args: unknown[]) => {
                chamadas.push({ alvo: nome, metodo, args });
                return b;
            });
        b.select = registrar('select');
        b.eq = registrar('eq');
        b.is = registrar('is');
        b.delete = registrar('delete');
        // `limit` fecha a consulta de vínculo; `delete().eq()` é aguardado direto.
        b.limit = vi.fn((...args: unknown[]) => {
            chamadas.push({ alvo: nome, metodo: 'limit', args });
            return Promise.resolve({
                data: opcoes.contratosVinculados ?? [],
                error: opcoes.erroDaConsultaDeVinculo ?? null,
            });
        });
        b.then = (resolver: (v: unknown) => unknown) =>
            Promise.resolve({ error: opcoes.erroDoDelete ?? null }).then(resolver);
        return b;
    }

    vi.doMock('@/lib/supabase/client', () => ({
        supabase: {
            from: vi.fn((nome: string) => tabela(nome)),
            storage: { from: vi.fn(() => ({ remove })) },
        },
    }));

    return { chamadas, remove };
}

const ASSET = { id: 'a1', filePath: 'org-1/empresa-9/uuid.pdf' };

beforeEach(() => {
    vi.resetModules();
});

describe('excluir()', () => {
    it('apaga os bytes ANTES da linha', async () => {
        const { chamadas } = montarMock({});
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        const { error } = await clientAssetsService.excluir(ASSET);
        expect(error).toBeNull();

        const posicaoDoStorage = chamadas.findIndex(c => c.alvo === 'storage');
        const posicaoDoDelete = chamadas.findIndex(
            c => c.alvo === 'client_assets' && c.metodo === 'delete',
        );
        expect(posicaoDoStorage, 'o Storage não foi chamado').toBeGreaterThanOrEqual(0);
        expect(posicaoDoDelete, 'o delete da linha não foi chamado').toBeGreaterThanOrEqual(0);
        expect(
            posicaoDoStorage,
            'a linha foi apagada antes dos bytes — inverter a ordem produz byte órfão',
        ).toBeLessThan(posicaoDoDelete);
    });

    it('o delete mira o id do asset, e só ele', async () => {
        // Sem esta asserção, remover o `.eq('id', …)` do delete passa verde e
        // apaga a linha de TODOS os arquivos do dossiê da organização (a RLS
        // limita o estrago à organização, não ao asset), deixando todos os
        // bytes órfãos no bucket. Achado por teste de mutação.
        const { chamadas } = montarMock({});
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');
        await clientAssetsService.excluir(ASSET);

        const daTabela = chamadas.filter(c => c.alvo === 'client_assets');
        expect(daTabela.some(c => c.metodo === 'delete')).toBe(true);
        expect(
            daTabela.some(c => c.metodo === 'eq' && c.args[0] === 'id' && c.args[1] === ASSET.id),
            'o delete não filtrou por id — apagaria o dossiê inteiro da organização',
        ).toBe(true);
    });

    it('erro no delete da linha é devolvido, não engolido', async () => {
        // Quarta ordem de falha: o Storage apagou, a linha não. O cabeçalho
        // deste arquivo usa esse caso pra justificar a ordem escolhida, e ele
        // nunca rodava — a opção `erroDoDelete` do mock era morta.
        montarMock({ erroDoDelete: new Error('linha travada') });
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        const { error } = await clientAssetsService.excluir(ASSET);
        expect(error?.message).toBe('linha travada');
    });

    it('remove exatamente o caminho do asset', async () => {
        const { remove } = montarMock({});
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');
        await clientAssetsService.excluir(ASSET);
        expect(remove).toHaveBeenCalledWith([ASSET.filePath]);
    });

    it('erro do Storage para a exclusão e NÃO apaga a linha', async () => {
        const { chamadas } = montarMock({ erroDoStorage: new Error('storage fora do ar') });
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        const { error } = await clientAssetsService.excluir(ASSET);
        expect(error?.message).toBe('storage fora do ar');

        const apagouLinha = chamadas.some(
            c => c.alvo === 'client_assets' && c.metodo === 'delete',
        );
        expect(
            apagouLinha,
            'a linha foi apagada apesar do erro no Storage — isso deixa byte órfão',
        ).toBe(false);
    });

    it('recusa apagar o contrato assinado de um contrato', async () => {
        const { chamadas, remove } = montarMock({ contratosVinculados: [{ id: 'contrato-1' }] });
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        const { error } = await clientAssetsService.excluir(ASSET);
        expect(error?.message).toContain('contrato assinado');

        expect(remove, 'os bytes foram apagados mesmo com o vínculo').not.toHaveBeenCalled();
        expect(
            chamadas.some(c => c.alvo === 'client_assets' && c.metodo === 'delete'),
            'a linha foi apagada mesmo com o vínculo',
        ).toBe(false);
    });

    it('a consulta de vínculo ignora contrato já excluído', async () => {
        const { chamadas } = montarMock({});
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');
        await clientAssetsService.excluir(ASSET);

        const consulta = chamadas.filter(c => c.alvo === 'client_contracts');
        expect(consulta.some(c => c.metodo === 'eq' && c.args[0] === 'signed_asset_id')).toBe(true);
        expect(
            consulta.some(c => c.metodo === 'is' && c.args[0] === 'deleted_at'),
            'contrato excluído bloquearia a exclusão do arquivo pra sempre',
        ).toBe(true);
    });

    it('falha na consulta de vínculo não deixa a exclusão seguir', async () => {
        const { remove } = montarMock({ erroDaConsultaDeVinculo: new Error('sem rede') });
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        const { error } = await clientAssetsService.excluir(ASSET);
        expect(error?.message).toBe('sem rede');
        expect(remove, 'apagou os bytes sem saber se havia vínculo').not.toHaveBeenCalled();
    });
});
