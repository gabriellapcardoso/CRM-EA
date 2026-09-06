/**
 * Guardas estáticas da migration do Módulo Clientes.
 *
 * O arquivo é lido como TEXTO, e por isso os comentários são removidos ANTES
 * de qualquer casamento. Sem isso a asserção casa na prosa com a mesma
 * facilidade que no SQL — e a prosa costuma ser justamente o comentário que
 * explica o conserto. Aconteceu duas vezes neste repositório, em dias
 * seguidos. Cada guarda abaixo foi verificada por injeção de regressão:
 * apagar a linha do conserto deixa o teste vermelho.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CAMINHO = join(
    process.cwd(),
    'supabase/migrations/20260905120000_modulo_clientes.sql',
);

/** Tira `-- linha` e `/* bloco *\/`, deixando só SQL executável. */
function semComentarios(sql: string): string {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(linha => linha.replace(/--.*$/, ''))
        .join('\n');
}

const SQL = semComentarios(readFileSync(CAMINHO, 'utf-8'));

describe('contrato vigente', () => {
    // Sem o índice, o join da listagem multiplica a empresa por contrato e o
    // MRR total sobe sem nada acusar: a soma fica maior e parece certa.
    it('declara índice único parcial de um contrato vigente por empresa', () => {
        // Afirma a COLUNA indexada e o predicado inteiro. A primeira versão só
        // procurava o nome do índice e a palavra 'vigente' em algum lugar
        // depois dele: trocar company_id por organization_id (um contrato
        // vigente por ORGANIZAÇÃO) ou tirar o `deleted_at IS NULL` (renovação
        // impossível depois de excluir) mantinha o teste verde.
        const bloco = SQL.match(
            /CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contracts_um_vigente([\s\S]*?);/,
        )?.[1];
        expect(bloco, 'índice idx_client_contracts_um_vigente não existe').toBeDefined();
        expect(bloco).toContain('ON public.client_contracts(company_id)');
        expect(bloco).toContain("WHERE status = 'vigente' AND deleted_at IS NULL");
    });

    it('amarra o tamanho do documento ao tipo, e exige o tipo', () => {
        const bloco = SQL.match(
            /client_contracts_doc_number_check([\s\S]*?);/,
        )?.[1];
        expect(bloco).toContain("document_type = 'cpf'  AND document_number ~ '^[0-9]{11}$'");
        expect(bloco).toContain("document_type = 'cnpj' AND document_number ~ '^[0-9]{14}$'");
        // Sem esta linha o CHECK inteiro avalia NULL quando document_type é
        // NULL (NULL AND TRUE = NULL), e CHECK só rejeita FALSE — um CPF
        // entraria sem tipo declarado.
        expect(bloco).toContain('document_type IS NOT NULL');
    });

    // Com CASCADE, o DELETE físico de companiesService.delete() apagaria
    // contrato com CNPJ e endereço sem aviso. RESTRICT faz a exclusão falhar.
    it('o contrato bloqueia a exclusão da empresa em vez de sumir junto', () => {
        const bloco = SQL.match(
            /CREATE TABLE IF NOT EXISTS public\.client_contracts([\s\S]*?\n\);)/,
        )?.[1];
        expect(bloco).toContain(
            'company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE RESTRICT',
        );
    });

    it('recusa valor mensal negativo', () => {
        expect(SQL).toMatch(/client_contracts_valor_check[\s\S]{0,80}?CHECK \(monthly_value >= 0\)/);
    });
});

describe('PII fora do RAG', () => {
    // Contrato assinado carrega CPF/CNPJ e endereço. A aplicação exclui
    // kind='contrato' do caminho de upload; esta constraint é a barreira que
    // sobrevive a um refactor futuro da aplicação.
    it('proíbe contrato assinado de ter id de documento no File Search Store', () => {
        expect(SQL).toMatch(
            /CHECK \(NOT \(kind = 'contrato' AND rag_document_id IS NOT NULL\)\)/,
        );
    });

    it('guarda o store por empresa, não por arquivo', () => {
        expect(SQL).toMatch(
            /CREATE TABLE IF NOT EXISTS public\.client_rag_store[\s\S]{0,200}?company_id UUID PRIMARY KEY/,
        );
    });
});

describe('bucket client-assets', () => {
    /**
     * Recorta cada policy de `storage.objects` do bucket como um bloco fechado,
     * do `CREATE POLICY` até o `;` que o encerra.
     *
     * A primeira versão desta guarda casava
     * `FOR SELECT TO authenticated[\s\S]{0,400}?storage.foldername` no arquivo
     * inteiro — e passava com a policy de SELECT quebrada, porque os 400
     * caracteres atravessavam a fronteira e achavam o `foldername` da policy
     * SEGUINTE. Verde sem medir nada. Só a injeção de regressão mostrou.
     */
    const politicas = new Map(
        [
            ...SQL.matchAll(
                /CREATE POLICY "client_assets_(\w+)" ON storage\.objects([\s\S]*?);\n/g,
            ),
        ].map(m => [m[1], m[2]] as const),
    );

    const OPERACOES: ReadonlyArray<[string, string]> = [
        ['insert', 'INSERT'],
        ['select', 'SELECT'],
        ['update', 'UPDATE'],
        ['delete', 'DELETE'],
    ];

    it('nasce privado', () => {
        expect(SQL).toMatch(
            /INSERT INTO storage\.buckets[\s\S]{0,200}?'client-assets'[\s\S]{0,120}?false/,
        );
    });

    it('tem exatamente as quatro policies, nem mais nem menos', () => {
        expect([...politicas.keys()].sort()).toEqual(['delete', 'insert', 'select', 'update']);
    });

    // O bucket deal-files isola a LINHA em deal_files por organização e deixa
    // os BYTES abertos a todo autenticado (schema_init.sql:1156). Copiar
    // aquele formato aqui exporia contrato com CNPJ entre organizações.
    it.each(OPERACOES)('a policy de %s isola por prefixo de pasta', (nome, operacao) => {
        const bloco = politicas.get(nome);
        expect(bloco, `policy client_assets_${nome} não existe`).toBeDefined();
        expect(bloco).toContain(`FOR ${operacao} TO authenticated`);
        expect(bloco).toContain(
            '(storage.foldername(name))[1] = public.get_user_org_id()::text',
        );
    });

    it('nenhuma policy do bucket se contenta com o bucket_id sozinho', () => {
        for (const [nome, bloco] of politicas) {
            expect(bloco, `policy client_assets_${nome} sem isolamento de pasta`).toContain(
                'storage.foldername',
            );
        }
    });
});

describe('integridade entre organizações', () => {
    // RLS garante que a LINHA é da organização do usuário; não impede a linha
    // apontar company_id de OUTRA organização, porque FK simples não valida
    // isso. Mesmo padrão de check_contact_product_interest_tenant.
    it.each([
        'client_contracts',
        'client_context',
        'client_rag_store',
        'client_assets',
        'client_events',
    ])('%s tem trigger que confere a organização da empresa', tabela => {
        const bloco = SQL.match(
            new RegExp(`CREATE TRIGGER trg_${tabela}_tenant([\\s\\S]*?);`),
        )?.[1];
        expect(bloco, `trigger trg_${tabela}_tenant não existe`).toBeDefined();
        expect(bloco).toContain(`ON public.${tabela}`);
        expect(bloco).toContain('check_client_company_tenant');
        // `BEFORE INSERT` sozinho deixaria trocar company_id ou
        // organization_id num UPDATE e montar a referência cruzada depois.
        expect(bloco).toContain('BEFORE INSERT OR UPDATE');
    });

    // O trigger que preenche organization_id existe desde 20260222000000,
    // criado porque services inseriam sem o campo e levavam 403 da RLS. As
    // tabelas deste módulo declaram a coluna NOT NULL e o service não a envia.
    it.each([
        'client_contracts',
        'client_context',
        'client_rag_store',
        'client_assets',
        'client_team',
        'client_events',
    ])('%s preenche organization_id por trigger', tabela => {
        const bloco = SQL.match(
            new RegExp(`CREATE TRIGGER ${tabela}_set_org_id([\\s\\S]*?);`),
        )?.[1];
        expect(bloco, `trigger ${tabela}_set_org_id não existe`).toBeDefined();
        expect(bloco).toContain(`BEFORE INSERT ON public.${tabela}`);
        expect(bloco).toContain('set_organization_id_from_profile');
    });

    // Ordem dos triggers BEFORE é alfabética por nome. `client_*_set_org_id`
    // vem antes de `trg_client_*_tenant`, mas isso não pode ficar de pé por
    // sorte: a função de checagem levanta exceção se chegar NULL.
    it('a checagem falha alto se organization_id chegar vazia', () => {
        expect(SQL).toContain(
            "RAISE EXCEPTION 'organization_id não foi preenchido",
        );
    });

    it('valida também os perfis referenciados e o contrato assinado', () => {
        for (const trecho of [
            "RAISE EXCEPTION 'owner_id não pertence à organização informada'",
            "RAISE EXCEPTION 'created_by não pertence à organização informada'",
            "RAISE EXCEPTION 'actor_id não pertence à organização informada'",
            "RAISE EXCEPTION 'signed_asset_id não é um contrato desta empresa'",
        ]) {
            expect(SQL).toContain(trecho);
        }
    });

    it('client_team confere empresa E perfil', () => {
        expect(SQL).toMatch(/check_client_team_tenant/);
        expect(SQL).toContain("RAISE EXCEPTION 'profile_id não pertence à organização informada'");
    });
});

describe('RLS das tabelas do módulo', () => {
    it.each([
        'client_contracts',
        'client_context',
        'client_rag_store',
        'client_assets',
        'client_team',
        'client_events',
    ])('%s tem RLS ligada e policy por organização', tabela => {
        expect(SQL).toContain(`ALTER TABLE public.${tabela} ENABLE ROW LEVEL SECURITY`);
        expect(SQL).toMatch(
            new RegExp(
                `CREATE POLICY "${tabela}_org_isolate" ON public\\.${tabela}[\\s\\S]{0,200}?USING \\(organization_id = public\\.get_user_org_id\\(\\)\\)`,
            ),
        );
    });
});
