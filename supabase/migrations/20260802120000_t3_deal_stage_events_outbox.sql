-- =============================================================================
-- T3 (emissor) — Ponte Negociação → Gerador de Propostas Comerciais
--
-- Quando um deal do board "negociacao" (key='negociacao') entra no estágio
-- "Topou proposta", o Gerador de Propostas precisa saber pra criar uma
-- proposta-rascunho automaticamente. Padrão escolhido: OUTBOX, não HTTP
-- direto dentro de uma transação de banco — inserir uma linha aqui é síncrono
-- e barato; o envio HTTP de verdade acontece fora, no dispatcher
-- (Edge Function `deal-stage-dispatcher`, rodando via pg_cron a cada 1-2min,
-- ver migration seguinte), com timeout/retry controlados em nível de
-- aplicação (mesmo padrão do emissor T2 em prospeccao-aaagencia/lib/
-- crm-export-servidor.ts).
--
-- Decisão de implementação (não pedida explicitamente, documentada aqui):
-- o gatilho é um TRIGGER AFTER UPDATE em public.deals, não um INSERT dentro
-- do corpo da RPC move_deal_to_stage. Motivo: o cockpit de deals
-- (DealCockpitClient.tsx → useMoveDeal → dealsService.update) move o stage
-- via UPDATE direto na tabela quando um humano arrasta o card — NÃO chama a
-- RPC. Só o agente IA chama move_deal_to_stage (lib/ai/tools.ts). Se o
-- outbox só disparasse dentro da RPC, o caminho mais comum (humano
-- arrastando o card) nunca geraria proposta. Um trigger na tabela cobre os
-- dois caminhos de escrita na mesma transação, sem precisar duplicar a
-- lógica em dois lugares. Não modifica o comportamento hoje existente de
-- move_deal_to_stage — só passa a coexistir com o novo trigger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela deal_stage_events (outbox)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_stage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    stage_slug TEXT NOT NULL,
    external_event_id TEXT NOT NULL UNIQUE,
    contador INTEGER NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falhou')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    response_status INTEGER,
    erro TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ
);

COMMENT ON TABLE public.deal_stage_events IS
  'Outbox T3: um evento por vez que um deal entra no estágio "Topou proposta" do board Negociação. Consumido pela Edge Function deal-stage-dispatcher (pg_cron).';
COMMENT ON COLUMN public.deal_stage_events.contador IS
  'Ordinal de "topou" desse deal (1ª vez, 2ª vez...) — cobre deal que topa, volta, topa de novo.';
COMMENT ON COLUMN public.deal_stage_events.external_event_id IS
  'Formato deal:{deal_id}:topou:{contador} — chave de idempotência no receptor.';

CREATE INDEX IF NOT EXISTS idx_deal_stage_events_status
  ON public.deal_stage_events (status, attempt_count)
  WHERE status IN ('pendente', 'falhou');

CREATE INDEX IF NOT EXISTS idx_deal_stage_events_deal_id
  ON public.deal_stage_events (deal_id);

CREATE INDEX IF NOT EXISTS idx_deal_stage_events_org_id
  ON public.deal_stage_events (organization_id);

ALTER TABLE public.deal_stage_events ENABLE ROW LEVEL SECURITY;

-- Só leitura direta pra org members (autenticados via app). Escrita acontece
-- só via trigger SECURITY DEFINER (insert), dispatcher com service_role
-- (update de status) e a RPC retry_deal_stage_event (SECURITY DEFINER,
-- abaixo) — nenhuma policy de INSERT/UPDATE pra `authenticated` de propósito.
DROP POLICY IF EXISTS "deal_stage_events_select_org" ON public.deal_stage_events;
CREATE POLICY "deal_stage_events_select_org" ON public.deal_stage_events
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

REVOKE ALL ON public.deal_stage_events FROM PUBLIC;
REVOKE ALL ON public.deal_stage_events FROM anon;
GRANT SELECT ON public.deal_stage_events TO authenticated;
GRANT ALL ON public.deal_stage_events TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Trigger — emite o evento quando o deal entra em "Topou proposta"
--
-- Identifica o estágio-alvo por JOIN em board_stages/boards (board key =
-- 'negociacao', stage name = 'Topou proposta' — ver seed_negociacao_board em
-- 20260722210000_t1_negociacao_board_semantics.sql), não por comparação de
-- string livre contra o stage_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_deal_stage_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_target_stage BOOLEAN;
    v_contador INTEGER;
    v_external_event_id TEXT;
    v_contact RECORD;
    v_payload JSONB;
BEGIN
    -- Só nos importa mudança de estágio de verdade
    IF NEW.stage_id IS NULL OR OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
        RETURN NEW;
    END IF;

    SELECT TRUE INTO v_is_target_stage
      FROM public.board_stages bs
      JOIN public.boards b ON b.id = bs.board_id
     WHERE bs.id = NEW.stage_id
       AND b.key = 'negociacao'
       AND bs.name = 'Topou proposta'
       AND b.organization_id = NEW.organization_id;

    IF NOT COALESCE(v_is_target_stage, FALSE) THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) + 1 INTO v_contador
      FROM public.deal_stage_events
     WHERE deal_id = NEW.id;

    v_external_event_id := 'deal:' || NEW.id::text || ':topou:' || v_contador::text;

    -- Contato vinculado ao deal — telefone/email podem ser nulos, não bloqueia
    SELECT c.name, c.phone, c.email, c.company_name
      INTO v_contact
      FROM public.contacts c
     WHERE c.id = NEW.contact_id;

    v_payload := jsonb_build_object(
        'external_event_id', v_external_event_id,
        'deal_id', NEW.id,
        'contador', v_contador,
        'organization_id', NEW.organization_id,
        'contact', jsonb_build_object(
            'nome', COALESCE(v_contact.name, NULL),
            'telefone', v_contact.phone,
            'email', v_contact.email,
            'empresa', v_contact.company_name
        ),
        'deal', jsonb_build_object(
            'titulo', NEW.title,
            'valor', NEW.value,
            'moeda', 'BRL'
        ),
        'topou_em', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    INSERT INTO public.deal_stage_events
        (deal_id, organization_id, stage_slug, external_event_id, contador, payload)
    VALUES
        (NEW.id, NEW.organization_id, 'topou-proposta', v_external_event_id, v_contador, v_payload)
    ON CONFLICT (external_event_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_deal_stage_event ON public.deals;
CREATE TRIGGER trg_emit_deal_stage_event
AFTER UPDATE ON public.deals
FOR EACH ROW
WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
EXECUTE FUNCTION public.emit_deal_stage_event();

-- -----------------------------------------------------------------------------
-- 3. RPC — reenvio manual de um evento falhado (padrão "Reenviar pro CRM" do
--    ecossistema, ver HANDOFF.md do gerador de propostas)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retry_deal_stage_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT organization_id INTO v_org_id
      FROM public.deal_stage_events
     WHERE id = p_event_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_org_id != public.get_user_org_id() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    -- Reciclar pro dispatcher pegar na próxima rodada do cron. Não mexe em
    -- eventos já 'enviado' (idempotência de UI: reenviar sucesso é no-op).
    UPDATE public.deal_stage_events
       SET status = 'pendente',
           erro = NULL
     WHERE id = p_event_id
       AND status = 'falhou';
END;
$$;

REVOKE ALL ON FUNCTION public.retry_deal_stage_event(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_deal_stage_event(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.retry_deal_stage_event(UUID) TO authenticated;
