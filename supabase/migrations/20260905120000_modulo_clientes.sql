-- Migration: modulo_clientes (F1)
-- Governança de carteira pós-venda.
--
-- Decisão central (revisão adversarial de 2026-09-05): a empresa JÁ é o cliente.
-- crm_companies ganha as colunas de governança em vez de existir uma tabela
-- `clients` paralela — uma segunda identidade obrigaria a sincronizar name,
-- owner_id, organization_id, status e deleted_at pra sempre, e faria toda query
-- de contato ou deal traduzir client_company_id -> clients.company_id -> clients.id.
--
-- Idempotente. Ver PLANO-CLIENTES.md §3.

-- =============================================================================
-- 1. GOVERNANÇA EM crm_companies
-- =============================================================================

ALTER TABLE public.crm_companies
  ADD COLUMN IF NOT EXISTS is_client       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_since    DATE,
  ADD COLUMN IF NOT EXISTS niche           TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT,
  ADD COLUMN IF NOT EXISTS category        TEXT,
  ADD COLUMN IF NOT EXISTS health_score    INTEGER,
  ADD COLUMN IF NOT EXISTS health_source   TEXT NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  ALTER TABLE public.crm_companies ADD CONSTRAINT crm_companies_niche_check
    CHECK (niche IS NULL OR niche IN (
      'local','ecommerce','infoproduto','servicos_digitais',
      'politico_mandato','politico_eleitoral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.crm_companies ADD CONSTRAINT crm_companies_lifecycle_check
    CHECK (lifecycle_stage IS NULL OR lifecycle_stage IN (
      'lead','contrato_assinado','kickoff','setup_concluido','em_operacao','churn'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.crm_companies ADD CONSTRAINT crm_companies_category_check
    CHECK (category IS NULL OR category IN ('ouro','prata','bronze'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.crm_companies ADD CONSTRAINT crm_companies_health_score_check
    CHECK (health_score IS NULL OR (health_score >= 0 AND health_score <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- health_source registra a PROCEDÊNCIA do número, não só o número. Hoje só
-- existe 'manual'; quando a pesquisa de NPS existir, dá pra saber qual score
-- veio de resposta de cliente e qual veio de opinião de quem digitou.
DO $$ BEGIN
  ALTER TABLE public.crm_companies ADD CONSTRAINT crm_companies_health_source_check
    CHECK (health_source IN ('manual','nps'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice parcial: a carteira é um subconjunto pequeno das empresas.
CREATE INDEX IF NOT EXISTS idx_crm_companies_carteira
  ON public.crm_companies(organization_id, lifecycle_stage)
  WHERE is_client AND deleted_at IS NULL;

COMMENT ON COLUMN public.crm_companies.lifecycle_stage IS
  'Estágio da RELAÇÃO com a conta, não do negócio. Sobrevive a qualquer deal: '
  'cliente em em_operacao pode ter zero deals abertos. NUNCA escrito por '
  'automação de deal — o board pós-venda continua sendo outro eixo.';

-- =============================================================================
-- 2. client_contracts — 1:N, com vigência
-- =============================================================================
-- Contrato único perderia a história: renovação, reajuste, churn e reativação
-- são fatos datados, e sobrescrever uma linha impede explicar o MRR do mês
-- passado. TABELA DE PII: document_number e endereço. Ver §7.1 e §7.5 do plano.

-- ON DELETE RESTRICT, não CASCADE, e é a única satélite assim.
-- `companiesService.delete()` (lib/supabase/contacts.ts:778) faz DELETE FÍSICO
-- em crm_companies, apesar de a tabela estar na lista de soft-delete do
-- CLAUDE.md. Com CASCADE, um clique em "excluir empresa" na tela de Contatos
-- apagaria de vez o contrato com CNPJ e endereço — e os arquivos no Storage
-- ficariam órfãos, porque cascata de banco não alcança bucket. RESTRICT faz a
-- exclusão falhar em vez de destruir dado cadastral em silêncio.
CREATE TABLE IF NOT EXISTS public.client_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE RESTRICT,

    monthly_value NUMERIC NOT NULL DEFAULT 0,
    starts_at DATE NOT NULL,
    ends_at DATE,
    renewal_date DATE,
    status TEXT NOT NULL DEFAULT 'rascunho',
    payment_method TEXT,
    scope TEXT[] DEFAULT '{}',

    -- Dados cadastrais (PII)
    document_type TEXT,
    document_number TEXT,
    address_zip TEXT,
    address_street TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_district TEXT,
    address_city TEXT,
    address_state TEXT,

    signed_asset_id UUID,

    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    owner_id UUID REFERENCES public.profiles(id),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

DO $$ BEGIN
  ALTER TABLE public.client_contracts ADD CONSTRAINT client_contracts_status_check
    CHECK (status IN ('rascunho','vigente','encerrado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_contracts ADD CONSTRAINT client_contracts_doc_type_check
    CHECK (document_type IS NULL OR document_type IN ('cpf','cnpj'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- document_number guarda SÓ dígitos; o tamanho tem que concordar com o tipo.
-- Dígito verificador é validado na aplicação (lib/clients/documento.ts) —
-- '11111111111' passa aqui e falha lá, de propósito.
DO $$ BEGIN
  ALTER TABLE public.client_contracts ADD CONSTRAINT client_contracts_doc_number_check
    CHECK (
      document_number IS NULL
      OR (
        -- O tipo é exigido explicitamente. Sem esta linha, document_type NULL
        -- faz cada disjunção virar NULL (NULL AND TRUE = NULL), o CHECK inteiro
        -- avalia NULL, e CHECK só rejeita FALSE — um CPF entraria sem tipo.
        document_type IS NOT NULL
        AND (
          (document_type = 'cpf'  AND document_number ~ '^[0-9]{11}$')
          OR (document_type = 'cnpj' AND document_number ~ '^[0-9]{14}$')
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MRR e LTV somam este campo. Valor negativo faria os indicadores DIMINUIREM
-- e ninguém suspeitaria do número, só do resultado.
DO $$ BEGIN
  ALTER TABLE public.client_contracts ADD CONSTRAINT client_contracts_valor_check
    CHECK (monthly_value >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_contracts ADD CONSTRAINT client_contracts_periodo_check
    CHECK (ends_at IS NULL OR ends_at >= starts_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- UM contrato vigente por empresa. Sem isto o join da listagem multiplica a
-- linha e o MRR total sobe sem nada acusar — a soma fica maior e parece certa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contracts_um_vigente
  ON public.client_contracts(company_id)
  WHERE status = 'vigente' AND deleted_at IS NULL;

-- Documento único por organização, ignorando os excluídos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contracts_documento_unico
  ON public.client_contracts(organization_id, document_number)
  WHERE document_number IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_contracts_company
  ON public.client_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_org
  ON public.client_contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_renovacao
  ON public.client_contracts(organization_id, renewal_date)
  WHERE status = 'vigente' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_contracts_owner
  ON public.client_contracts(owner_id);

ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. client_context — 1:1 por empresa (PK = FK, sem id próprio)
-- =============================================================================
-- links, offerings e benchmarks são jsonb de propósito: ninguém consulta
-- "todos os clientes com Instagram". Viram tabela no dia em que alguém
-- precisar consultar ENTRE clientes, não antes.

CREATE TABLE IF NOT EXISTS public.client_context (
    company_id UUID PRIMARY KEY REFERENCES public.crm_companies(id) ON DELETE CASCADE,

    tone_of_voice TEXT,
    keywords TEXT[] DEFAULT '{}',
    avoid TEXT[] DEFAULT '{}',
    audience JSONB DEFAULT '{}'::jsonb,
    competitors JSONB DEFAULT '[]'::jsonb,
    company_values TEXT[] DEFAULT '{}',

    logo_path TEXT,
    brand_colors TEXT[] DEFAULT '{}',

    links JSONB DEFAULT '[]'::jsonb,
    offerings JSONB DEFAULT '[]'::jsonb,
    benchmarks JSONB DEFAULT '{}'::jsonb,

    deliverables TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_context_org
  ON public.client_context(organization_id);

ALTER TABLE public.client_context ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. client_rag_store — 1:1 por empresa
-- =============================================================================
-- Cardinalidade certa: UM store contém MUITOS documentos. Guardar store_id por
-- arquivo (como a primeira versão do plano propunha) estaria errado e teria que
-- ser desfeito depois, sobre dado real.

CREATE TABLE IF NOT EXISTS public.client_rag_store (
    company_id UUID PRIMARY KEY REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_rag_store_org
  ON public.client_rag_store(organization_id);

ALTER TABLE public.client_rag_store ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. client_assets — dossiê
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.client_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,

    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    kind TEXT NOT NULL DEFAULT 'documento',

    -- id do documento DENTRO do store da empresa. Nulo = não chegou no RAG,
    -- e isso é estado visível na tela, não erro silencioso.
    rag_document_id TEXT,
    rag_uploaded_at TIMESTAMPTZ,

    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

DO $$ BEGIN
  ALTER TABLE public.client_assets ADD CONSTRAINT client_assets_kind_check
    CHECK (kind IN ('documento','foto_autorizada','contrato','gerado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contrato assinado carrega CPF/CNPJ e endereço. Ele NUNCA sobe pro File
-- Search Store — nem por engano, nem por refactor futuro. A aplicação exclui
-- kind='contrato' do caminho de upload; esta constraint é a segunda barreira.
DO $$ BEGIN
  ALTER TABLE public.client_assets ADD CONSTRAINT client_assets_contrato_fora_do_rag
    CHECK (NOT (kind = 'contrato' AND rag_document_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_client_assets_company
  ON public.client_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_client_assets_org
  ON public.client_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_assets_created_by
  ON public.client_assets(created_by);

ALTER TABLE public.client_assets ENABLE ROW LEVEL SECURITY;

-- signed_asset_id só pode apontar pra um asset depois que a tabela existe.
DO $$ BEGIN
  ALTER TABLE public.client_contracts
    ADD CONSTRAINT client_contracts_signed_asset_fk
    FOREIGN KEY (signed_asset_id) REFERENCES public.client_assets(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_client_contracts_signed_asset
  ON public.client_contracts(signed_asset_id);

-- =============================================================================
-- 6. client_team — equipe interna atribuída
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.client_team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_team_unico
  ON public.client_team(company_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_client_team_org
  ON public.client_team(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_team_profile
  ON public.client_team(profile_id);

ALTER TABLE public.client_team ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 7. client_events — SÓ marcos escritos à mão
-- =============================================================================
-- A timeline é DERIVADA: activities dos deals e contatos da empresa, mais
-- deal_stage_events. activities não tem client_company_id (só deal_id e
-- contact_id), então a derivação é por join, como ContactDetailPage já faz.
-- Esta tabela existe só pro que não é derivável: "kickoff realizado",
-- "reunião trimestral", marcos que ninguém registra como atividade.

CREATE TABLE IF NOT EXISTS public.client_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_events_company
  ON public.client_events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_events_org
  ON public.client_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_events_actor
  ON public.client_events(actor_id);

ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 8. RLS — mesmo formato do resto do repositório
-- =============================================================================
-- get_user_org_id() de 20260224000000: STABLE + SECURITY DEFINER, permite o
-- Postgres cachear o resultado por statement em vez de reexecutar por linha.

DROP POLICY IF EXISTS "client_contracts_org_isolate" ON public.client_contracts;
CREATE POLICY "client_contracts_org_isolate" ON public.client_contracts
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "client_context_org_isolate" ON public.client_context;
CREATE POLICY "client_context_org_isolate" ON public.client_context
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "client_rag_store_org_isolate" ON public.client_rag_store;
CREATE POLICY "client_rag_store_org_isolate" ON public.client_rag_store
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "client_assets_org_isolate" ON public.client_assets;
CREATE POLICY "client_assets_org_isolate" ON public.client_assets
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "client_team_org_isolate" ON public.client_team;
CREATE POLICY "client_team_org_isolate" ON public.client_team
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "client_events_org_isolate" ON public.client_events;
CREATE POLICY "client_events_org_isolate" ON public.client_events
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- =============================================================================
-- 9. Integridade entre organizações
-- =============================================================================
-- RLS garante que a LINHA é da organização do usuário. Não impede a linha
-- apontar company_id/profile_id de OUTRA organização — FK simples não valida
-- isso. Mesmo padrão de check_contact_product_interest_tenant (20260806140000).

-- ---------------------------------------------------------------------------
-- 9a. organization_id preenchido por trigger
-- ---------------------------------------------------------------------------
-- `set_organization_id_from_profile()` existe desde 20260222000000, criada
-- justamente porque vários services faziam INSERT sem organization_id
-- assumindo um trigger que não existia — e levavam 403 da RLS. Ela cobre
-- contacts, crm_companies, activities, deal_items e board_stages. As tabelas
-- deste módulo precisam da mesma cobertura: elas declaram organization_id
-- NOT NULL e o service não envia o campo.
--
-- ORDEM IMPORTA. O Postgres dispara triggers BEFORE de mesma operação em
-- ordem alfabética de NOME. `client_*_set_org_id` vem antes de
-- `trg_client_*_tenant`, então o preenchimento acontece antes da checagem.
-- Isso não fica de pé por sorte: a função de checagem abaixo levanta exceção
-- se organization_id chegar NULL, então qualquer renomeação que inverta a
-- ordem falha alto em vez de gravar linha sem organização.

DROP TRIGGER IF EXISTS client_contracts_set_org_id ON public.client_contracts;
CREATE TRIGGER client_contracts_set_org_id
  BEFORE INSERT ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_from_profile();

DROP TRIGGER IF EXISTS client_context_set_org_id ON public.client_context;
CREATE TRIGGER client_context_set_org_id
  BEFORE INSERT ON public.client_context
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_from_profile();

DROP TRIGGER IF EXISTS client_rag_store_set_org_id ON public.client_rag_store;
CREATE TRIGGER client_rag_store_set_org_id
  BEFORE INSERT ON public.client_rag_store
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_from_profile();

DROP TRIGGER IF EXISTS client_assets_set_org_id ON public.client_assets;
CREATE TRIGGER client_assets_set_org_id
  BEFORE INSERT ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_from_profile();

DROP TRIGGER IF EXISTS client_team_set_org_id ON public.client_team;
CREATE TRIGGER client_team_set_org_id
  BEFORE INSERT ON public.client_team
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_from_profile();

DROP TRIGGER IF EXISTS client_events_set_org_id ON public.client_events;
CREATE TRIGGER client_events_set_org_id
  BEFORE INSERT ON public.client_events
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_from_profile();

CREATE OR REPLACE FUNCTION public.check_client_company_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Falha alta se o preenchimento não aconteceu. Sem isto, uma inversão na
  -- ordem dos triggers deixaria a comparação com NULL passar em silêncio.
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id não foi preenchido — confira o trigger client_*_set_org_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm_companies
    WHERE id = NEW.company_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'company_id não pertence à organização informada';
  END IF;

  -- Perfis referenciados também têm que ser da mesma organização. RLS protege
  -- a LINHA; nada impede a linha da organização A apontar um perfil da B, e a
  -- FK aceita o UUID sem opinião.
  IF TG_TABLE_NAME = 'client_contracts' AND NEW.owner_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profiles
       WHERE id = NEW.owner_id AND organization_id = NEW.organization_id
     ) THEN
    RAISE EXCEPTION 'owner_id não pertence à organização informada';
  END IF;

  IF TG_TABLE_NAME = 'client_assets' AND NEW.created_by IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profiles
       WHERE id = NEW.created_by AND organization_id = NEW.organization_id
     ) THEN
    RAISE EXCEPTION 'created_by não pertence à organização informada';
  END IF;

  IF TG_TABLE_NAME = 'client_events' AND NEW.actor_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profiles
       WHERE id = NEW.actor_id AND organization_id = NEW.organization_id
     ) THEN
    RAISE EXCEPTION 'actor_id não pertence à organização informada';
  END IF;

  -- O contrato assinado tem que ser um asset DA MESMA EMPRESA e do tipo
  -- contrato — senão dá pra apontar o contrato de outro cliente como se
  -- fosse deste.
  IF TG_TABLE_NAME = 'client_contracts' AND NEW.signed_asset_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM client_assets
       WHERE id = NEW.signed_asset_id
         AND company_id = NEW.company_id
         AND organization_id = NEW.organization_id
         AND kind = 'contrato'
     ) THEN
    RAISE EXCEPTION 'signed_asset_id não é um contrato desta empresa';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_contracts_tenant ON public.client_contracts;
CREATE TRIGGER trg_client_contracts_tenant
  BEFORE INSERT OR UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.check_client_company_tenant();

DROP TRIGGER IF EXISTS trg_client_context_tenant ON public.client_context;
CREATE TRIGGER trg_client_context_tenant
  BEFORE INSERT OR UPDATE ON public.client_context
  FOR EACH ROW EXECUTE FUNCTION public.check_client_company_tenant();

DROP TRIGGER IF EXISTS trg_client_rag_store_tenant ON public.client_rag_store;
CREATE TRIGGER trg_client_rag_store_tenant
  BEFORE INSERT OR UPDATE ON public.client_rag_store
  FOR EACH ROW EXECUTE FUNCTION public.check_client_company_tenant();

DROP TRIGGER IF EXISTS trg_client_assets_tenant ON public.client_assets;
CREATE TRIGGER trg_client_assets_tenant
  BEFORE INSERT OR UPDATE ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.check_client_company_tenant();

DROP TRIGGER IF EXISTS trg_client_events_tenant ON public.client_events;
CREATE TRIGGER trg_client_events_tenant
  BEFORE INSERT OR UPDATE ON public.client_events
  FOR EACH ROW EXECUTE FUNCTION public.check_client_company_tenant();

-- client_team valida DOIS relacionamentos: a empresa e o perfil.
CREATE OR REPLACE FUNCTION public.check_client_team_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id não foi preenchido — confira o trigger client_team_set_org_id';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM crm_companies
    WHERE id = NEW.company_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'company_id não pertence à organização informada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = NEW.profile_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'profile_id não pertence à organização informada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_team_tenant ON public.client_team;
CREATE TRIGGER trg_client_team_tenant
  BEFORE INSERT OR UPDATE ON public.client_team
  FOR EACH ROW EXECUTE FUNCTION public.check_client_team_tenant();

-- =============================================================================
-- 10. Bucket do dossiê
-- =============================================================================
-- NÃO copiar a policy do bucket deal-files: ela é "bucket_id = 'deal-files'"
-- pra todo authenticated (schema_init.sql:1149-1163), ou seja, a LINHA em
-- deal_files é isolada por organização mas os BYTES do arquivo não são.
-- O padrão certo está em 20260210100002 (messaging-media): prefixo de pasta
-- por organização. Aqui ele vale pras QUATRO operações — messaging-media
-- deixa o SELECT público porque a API do WhatsApp precisa baixar o arquivo;
-- contrato assinado com CNPJ não tem essa desculpa.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('client-assets', 'client-assets', false, 20971520) -- 20MB
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520;

DROP POLICY IF EXISTS "client_assets_insert" ON storage.objects;
CREATE POLICY "client_assets_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-assets'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

DROP POLICY IF EXISTS "client_assets_select" ON storage.objects;
CREATE POLICY "client_assets_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-assets'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

DROP POLICY IF EXISTS "client_assets_update" ON storage.objects;
CREATE POLICY "client_assets_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-assets'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  )
  WITH CHECK (
    bucket_id = 'client-assets'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

DROP POLICY IF EXISTS "client_assets_delete" ON storage.objects;
CREATE POLICY "client_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-assets'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  );
