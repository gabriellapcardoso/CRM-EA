/**
 * Guardas do serviço do Módulo Clientes, achadas na revisão adversarial do PR #77.
 *
 * As duas primeiras leem o arquivo como texto: a consulta é uma string que o
 * PostgREST interpreta, e não há tipo que a valide. Comentários são removidos
 * antes de casar — a asserção casaria na prosa com a mesma facilidade.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(join(process.cwd(), 'lib/supabase/clients.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');

describe('PII fora da listagem', () => {
    // `client_contracts!left(*)` traria documento e endereço completo de todos
    // os contratos de 25 empresas por página — inclusive os excluídos — para o
    // navegador, numa tela que só exibe valor, início e renovação.
    it('o embed do contrato na listagem não usa *', () => {
        expect(FONTE).not.toMatch(/client_contracts!left\(\*\)/);
        expect(FONTE).toMatch(/client_contracts!left\(\$\{SELECT_CONTRATO_RESUMO\}\)/);
    });

    it('o resumo não carrega documento nem endereço', () => {
        const resumo = FONTE.match(/const SELECT_CONTRATO_RESUMO =\s*'([^']+)'/)?.[1];
        expect(resumo, 'SELECT_CONTRATO_RESUMO não encontrado').toBeDefined();
        for (const proibido of [
            'document_number',
            'document_type',
            'address_zip',
            'address_street',
            'address_city',
            'notes',
        ]) {
            expect(resumo).not.toContain(proibido);
        }
        // E precisa trazer o que a tela realmente usa.
        for (const necessario of ['monthly_value', 'starts_at', 'renewal_date', 'status', 'deleted_at']) {
            expect(resumo).toContain(necessario);
        }
    });
});

describe('obter() só devolve quem está na carteira', () => {
    it('filtra is_client', () => {
        const bloco = FONTE.match(/async obter\(([\s\S]*?)\n    \},/)?.[1];
        expect(bloco, 'método obter não encontrado').toBeDefined();
        expect(bloco).toContain(".eq('is_client', true)");
        expect(bloco).toContain(".is('deleted_at', null)");
    });
});

describe('salvar() não apaga campo ausente do formulário', () => {
    function encadeavel(resultado: unknown) {
        const chamadas: { metodo: string; args: unknown[] }[] = [];
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is', 'update', 'insert']) {
            b[m] = vi.fn((...args: unknown[]) => {
                chamadas.push({ metodo: m, args });
                return b;
            });
        }
        b.single = vi.fn(() => Promise.resolve(resultado));
        (b as { _chamadas: typeof chamadas })._chamadas = chamadas;
        return b as typeof b & { _chamadas: typeof chamadas };
    }

    let builder: ReturnType<typeof encadeavel>;

    beforeEach(() => {
        vi.resetModules();
        builder = encadeavel({
            data: {
                id: 'c1',
                company_id: 'e1',
                monthly_value: 500,
                starts_at: '2026-01-01',
                status: 'vigente',
                organization_id: 'o1',
                created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
        });
        vi.doMock('@/lib/supabase/client', () => ({
            supabase: { from: vi.fn(() => builder) },
        }));
    });

    it('editar só o valor não zera scope nem notes', async () => {
        const { clientContractsService } = await import('@/lib/supabase/clients');
        await clientContractsService.salvar({
            id: 'c1',
            companyId: 'e1',
            startsAt: '2026-01-01',
            monthlyValue: 500,
        });

        const update = builder._chamadas.find(c => c.metodo === 'update');
        expect(update, 'update não foi chamado').toBeDefined();
        const campos = update!.args[0] as Record<string, unknown>;

        // O ContractForm não tem estes dois campos. Enviá-los como null
        // apagaria escopo e observações de um contrato importado, em silêncio,
        // ao editar só o valor mensal.
        expect(campos).not.toHaveProperty('scope');
        expect(campos).not.toHaveProperty('notes');
        expect(campos.monthly_value).toBe(500);
    });

    it('criar envia os obrigatórios mesmo sem valor informado', async () => {
        const { clientContractsService } = await import('@/lib/supabase/clients');
        await clientContractsService.salvar({ companyId: 'e1', startsAt: '2026-02-01' });

        const insert = builder._chamadas.find(c => c.metodo === 'insert');
        expect(insert, 'insert não foi chamado').toBeDefined();
        const campos = insert!.args[0] as Record<string, unknown>;
        expect(campos.company_id).toBe('e1');
        expect(campos.starts_at).toBe('2026-02-01');
        expect(campos.monthly_value).toBe(0);
        expect(campos.status).toBe('rascunho');
        // organization_id NÃO é enviado: quem preenche é o trigger
        // client_contracts_set_org_id (migration 20260905120000).
        expect(campos).not.toHaveProperty('organization_id');
    });
});
