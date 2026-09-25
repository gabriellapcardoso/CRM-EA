/**
 * Envio de arquivo pro dossiê: o CALL SITE, não a função pura.
 *
 * `test/clientAssetsCaminhoPorOrganizacao.test.ts` prova que
 * `caminhoDoAsset(organizationId, companyId, …)` monta o caminho certo. Isso
 * não é o mesmo que provar que `enviar()` passa os argumentos na ordem certa —
 * e não passava a ser: trocar a ordem no call site
 *
 *     caminhoDoAsset(entrada.companyId, entrada.organizationId, …)
 *
 * passava nos 15 testes que existiam. Os dois parâmetros são `string`, o
 * TypeScript não acusa, e em produção **todo upload falharia** na policy do
 * bucket com um erro que não explica a causa. Achado por teste de mutação na
 * revisão da F4a, não por leitura: reler o teste sempre confirma o que ele
 * pretendia provar.
 *
 * Regra que sai daqui: função pura com dois parâmetros adjacentes do mesmo
 * tipo precisa de teste no call site, ou os tipos deviam ser distintos.
 *
 * O outro buraco que este arquivo fecha: o desfazimento do upload quando o
 * insert falha. O cabeçalho do `clientAssets.ts` declara TRÊS correções
 * deliberadas sobre o `dealFiles`, e essa era a única sem guarda — e a única
 * que produz dado permanente e invisível (byte no bucket sem linha que o
 * descreva, fora do alcance de qualquer pedido de eliminação).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ORG = 'org-1111';
const EMPRESA = 'empresa-9999';

type Chamada = { alvo: string; metodo: string; args: unknown[] };

function montarMock(opcoes: { erroDoUpload?: Error | null; erroDoInsert?: Error | null } = {}) {
    const chamadas: Chamada[] = [];

    const upload = vi.fn((caminho: string, arquivo: unknown, cfg: unknown) => {
        chamadas.push({ alvo: 'storage', metodo: 'upload', args: [caminho, arquivo, cfg] });
        return Promise.resolve({ data: null, error: opcoes.erroDoUpload ?? null });
    });
    const remove = vi.fn((caminhos: string[]) => {
        chamadas.push({ alvo: 'storage', metodo: 'remove', args: [caminhos] });
        return Promise.resolve({ data: null, error: null });
    });

    function tabela(nome: string) {
        const b: Record<string, unknown> = {};
        const reg = (metodo: string) =>
            vi.fn((...args: unknown[]) => {
                chamadas.push({ alvo: nome, metodo, args });
                return b;
            });
        b.insert = reg('insert');
        b.select = reg('select');
        b.single = vi.fn(() => {
            chamadas.push({ alvo: nome, metodo: 'single', args: [] });
            return Promise.resolve(
                opcoes.erroDoInsert
                    ? { data: null, error: opcoes.erroDoInsert }
                    : {
                          data: {
                              id: 'a1',
                              company_id: EMPRESA,
                              file_name: 'contrato.pdf',
                              file_path: 'x',
                              file_size: 10,
                              mime_type: 'application/pdf',
                              kind: 'documento',
                              rag_document_id: null,
                              rag_uploaded_at: null,
                              deleted_at: null,
                              created_at: '2026-09-24T00:00:00Z',
                              created_by: null,
                              organization_id: ORG,
                          },
                          error: null,
                      },
            );
        });
        return b;
    }

    vi.doMock('@/lib/supabase/client', () => ({
        supabase: {
            from: vi.fn((nome: string) => tabela(nome)),
            storage: { from: vi.fn(() => ({ upload, remove })) },
        },
    }));

    return { chamadas, upload, remove };
}

/** `File` real o bastante pro serviço: nome, tamanho e tipo. */
function arquivoFalso(nome: string, bytes: number, tipo = 'application/pdf'): File {
    return {
        name: nome,
        size: bytes,
        type: tipo,
    } as unknown as File;
}

function entrada(over: Partial<{ file: File }> = {}) {
    return {
        companyId: EMPRESA,
        organizationId: ORG,
        file: over.file ?? arquivoFalso('contrato.pdf', 1024),
        kind: 'documento' as const,
    };
}

beforeEach(() => {
    vi.resetModules();
});

describe('enviar() — o caminho que chega no Storage', () => {
    it('o caminho enviado ao Storage começa pelo id da ORGANIZAÇÃO, não da empresa', async () => {
        const { upload } = montarMock();
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        await clientAssetsService.enviar(entrada());

        expect(upload).toHaveBeenCalled();
        const caminho = upload.mock.calls[0][0] as string;
        expect(
            caminho.split('/')[0],
            'o primeiro segmento não é a organização — a policy do bucket recusa este upload',
        ).toBe(ORG);
        expect(caminho.split('/')[1]).toBe(EMPRESA);
    });

    it('a linha guarda EXATAMENTE o caminho que foi enviado', async () => {
        // Divergência aqui não falha nada na hora: o arquivo sobe, a linha
        // aparece, e só o download e a exclusão quebram depois — apontando pra
        // um objeto que não existe naquele caminho.
        const { chamadas, upload } = montarMock();
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        await clientAssetsService.enviar(entrada());

        const caminhoEnviado = upload.mock.calls[0][0] as string;
        const insert = chamadas.find(c => c.alvo === 'client_assets' && c.metodo === 'insert');
        expect(insert, 'insert não foi chamado').toBeDefined();
        const campos = insert!.args[0] as Record<string, unknown>;
        expect(campos.file_path).toBe(caminhoEnviado);
    });

    it('não sobrescreve objeto existente', async () => {
        const { upload } = montarMock();
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');
        await clientAssetsService.enviar(entrada());

        const cfg = upload.mock.calls[0][2] as Record<string, unknown>;
        expect(cfg.upsert).toBe(false);
    });

    it('organization_id NÃO é enviado — quem preenche é o trigger', async () => {
        const { chamadas } = montarMock();
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');
        await clientAssetsService.enviar(entrada());

        const insert = chamadas.find(c => c.alvo === 'client_assets' && c.metodo === 'insert');
        const campos = insert!.args[0] as Record<string, unknown>;
        expect(campos).not.toHaveProperty('organization_id');
    });
});

describe('enviar() — o upload é desfeito quando o insert falha', () => {
    it('insert falhando remove o objeto que acabou de subir', async () => {
        // Byte órfão é pior que linha órfã: sem a linha, o arquivo é invisível
        // pro produto e ninguém consegue apagá-lo pela tela depois.
        const { upload, remove } = montarMock({ erroDoInsert: new Error('tenant check') });
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        const { data, error } = await clientAssetsService.enviar(entrada());

        expect(error?.message).toBe('tenant check');
        expect(data).toBeNull();
        expect(remove, 'o upload não foi desfeito — byte órfão no bucket').toHaveBeenCalled();

        const caminhoEnviado = upload.mock.calls[0][0] as string;
        const caminhoRemovido = (remove.mock.calls[0][0] as string[])[0];
        expect(
            caminhoRemovido,
            'a limpeza removeu um caminho diferente do que subiu — o órfão continua lá',
        ).toBe(caminhoEnviado);
    });

    it('insert bem-sucedido não remove nada', async () => {
        const { remove } = montarMock();
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');
        await clientAssetsService.enviar(entrada());
        expect(remove).not.toHaveBeenCalled();
    });

    it('upload falhando não tenta inserir linha nenhuma', async () => {
        const { chamadas } = montarMock({ erroDoUpload: new Error('storage fora') });
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        const { error } = await clientAssetsService.enviar(entrada());
        expect(error?.message).toBe('storage fora');
        expect(
            chamadas.some(c => c.alvo === 'client_assets' && c.metodo === 'insert'),
            'inseriu linha apontando pra objeto que nunca subiu',
        ).toBe(false);
    });
});

describe('enviar() — as guardas de tamanho', () => {
    it('arquivo vazio não chega ao Storage', async () => {
        const { upload } = montarMock();
        const { clientAssetsService } = await import('@/lib/supabase/clientAssets');

        const { error } = await clientAssetsService.enviar(
            entrada({ file: arquivoFalso('vazio.pdf', 0) }),
        );
        expect(error?.message).toContain('vazio');
        expect(upload).not.toHaveBeenCalled();
    });

    it('arquivo acima do limite não chega ao Storage', async () => {
        const { upload } = montarMock();
        const { clientAssetsService, TAMANHO_MAXIMO_BYTES } = await import(
            '@/lib/supabase/clientAssets'
        );

        const { error } = await clientAssetsService.enviar(
            entrada({ file: arquivoFalso('grande.pdf', TAMANHO_MAXIMO_BYTES + 1) }),
        );
        expect(error?.message).toContain('limite');
        expect(upload).not.toHaveBeenCalled();
    });

    it('o limite do código é o mesmo `file_size_limit` do bucket', async () => {
        // O comentário no `clientAssets.ts` afirma isso sobre outro arquivo, e
        // este repositório já viu afirmação assim envelhecer sozinha. O número
        // aparece na tela (`DossieTab.tsx`), então divergir faz a interface
        // mentir pra pessoa antes de o upload falhar no servidor.
        const { TAMANHO_MAXIMO_BYTES } = await import('@/lib/supabase/clientAssets');
        const migration = readFileSync(
            join(process.cwd(), 'supabase/migrations/20260905120000_modulo_clientes.sql'),
            'utf-8',
        );
        const bloco = migration.match(
            /INSERT INTO storage\.buckets[\s\S]{0,200}?'client-assets'[\s\S]{0,200}?;/,
        )?.[0];
        expect(bloco, 'declaração do bucket client-assets não encontrada').toBeDefined();

        const limiteNaMigration = bloco!.match(/,\s*(\d{4,})\)/)?.[1];
        expect(limiteNaMigration, 'file_size_limit não encontrado na migration').toBeDefined();
        expect(Number(limiteNaMigration)).toBe(TAMANHO_MAXIMO_BYTES);
    });
});
