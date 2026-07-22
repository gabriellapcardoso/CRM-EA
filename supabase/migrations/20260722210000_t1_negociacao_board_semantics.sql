-- =============================================================================
-- T1 — Modelagem dos boards (PLANO-NOVO-FLUXO.md)
--
-- 1. board_stages.requires_human_advance — estágios que o agente IA NÃO pode
--    auto-avançar (enforcement no código: stage-evaluator + tools).
-- 2. RPC move_deal_to_stage — semântica ÚNICA de fechamento: mover um deal
--    para o estágio Ganho/Perdido sincroniza is_won/is_lost/closed_at
--    atomicamente (hoje mark_deal_won/lost não mudam stage — schema_init:808).
-- 3. mark_deal_won/lost — passam a também mover o deal para o estágio
--    Ganho/Perdido do board (quando configurado), mantendo o auth guard
--    introduzido em 20260223000001.
-- 4. Seed idempotente do board "Negociação" (key 'negociacao') com UUIDs
--    determinísticos (md5 namespace + org) — reproduzível entre ambientes.
--    Também atribui key 'pos-venda' ao board Pós-venda existente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. requires_human_advance
-- -----------------------------------------------------------------------------
ALTER TABLE public.board_stages
  ADD COLUMN IF NOT EXISTS requires_human_advance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.board_stages.requires_human_advance IS
  'Se true, o agente IA nunca move um deal PARA este estágio automaticamente — sempre cria pending advance (HITL). Enforcement em lib/ai/agent/stage-evaluator.ts e lib/ai/tools.ts.';

-- -----------------------------------------------------------------------------
-- 2. RPC move_deal_to_stage — fonte de verdade única para mover deal de estágio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_deal_to_stage(
  p_deal_id UUID,
  p_stage_id UUID,
  p_loss_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_org_id UUID;
    v_board_id UUID;
    v_won_stage_id UUID;
    v_lost_stage_id UUID;
    v_stage_board_id UUID;
BEGIN
    -- Auth guard: service_role (agente IA server-side) ou usuário autenticado da mesma org
    IF v_role <> 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT d.organization_id, d.board_id
      INTO v_org_id, v_board_id
      FROM public.deals d
     WHERE d.id = p_deal_id AND d.deleted_at IS NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Deal not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_role <> 'service_role'
       AND v_org_id != (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    -- Estágio precisa pertencer ao board do deal (e à mesma org)
    SELECT s.board_id INTO v_stage_board_id
      FROM public.board_stages s
     WHERE s.id = p_stage_id AND s.organization_id = v_org_id;

    IF v_stage_board_id IS NULL OR v_stage_board_id IS DISTINCT FROM v_board_id THEN
        RAISE EXCEPTION 'Stage does not belong to deal board' USING ERRCODE = '22023';
    END IF;

    SELECT b.won_stage_id, b.lost_stage_id
      INTO v_won_stage_id, v_lost_stage_id
      FROM public.boards b
     WHERE b.id = v_board_id;

    -- Semântica única: um único UPDATE sincroniza stage + flags de fechamento
    UPDATE public.deals d
       SET stage_id = p_stage_id,
           last_stage_change_date = NOW(),
           is_won  = (v_won_stage_id  IS NOT NULL AND p_stage_id = v_won_stage_id),
           is_lost = (v_lost_stage_id IS NOT NULL AND p_stage_id = v_lost_stage_id),
           closed_at = CASE
               WHEN (v_won_stage_id IS NOT NULL AND p_stage_id = v_won_stage_id)
                 OR (v_lost_stage_id IS NOT NULL AND p_stage_id = v_lost_stage_id)
               THEN NOW()
               ELSE NULL  -- mover para estágio comum reabre o deal
           END,
           loss_reason = CASE
               WHEN v_lost_stage_id IS NOT NULL AND p_stage_id = v_lost_stage_id
                 THEN COALESCE(p_loss_reason, d.loss_reason)
               WHEN v_won_stage_id IS NOT NULL AND p_stage_id = v_won_stage_id
                 THEN NULL
               ELSE d.loss_reason
           END,
           updated_at = NOW()
     WHERE d.id = p_deal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_deal_to_stage(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_deal_to_stage(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_deal_to_stage(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_deal_to_stage(UUID, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. mark_deal_won / mark_deal_lost — agora também movem o stage
--    (mantém auth guard + org check de 20260223000001)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_deal_won(deal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_won_stage_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT d.organization_id INTO v_org_id
    FROM public.deals d
    WHERE d.id = deal_id AND d.deleted_at IS NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Deal not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_org_id != (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    -- Respeita won_stay_in_stage (archive): quando true, o deal ganha mas
    -- permanece na coluna atual — não movemos o stage
    SELECT b.won_stage_id INTO v_won_stage_id
    FROM public.boards b
    JOIN public.deals d ON d.board_id = b.id
    WHERE d.id = deal_id
      AND COALESCE(b.won_stay_in_stage, false) = false;

    UPDATE public.deals
    SET
        is_won = TRUE,
        is_lost = FALSE,
        loss_reason = NULL,
        closed_at = NOW(),
        stage_id = COALESCE(v_won_stage_id, stage_id),
        last_stage_change_date = CASE WHEN v_won_stage_id IS NOT NULL THEN NOW() ELSE last_stage_change_date END,
        updated_at = NOW()
    WHERE id = deal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_deal_lost(deal_id UUID, reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_lost_stage_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT d.organization_id INTO v_org_id
    FROM public.deals d
    WHERE d.id = deal_id AND d.deleted_at IS NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Deal not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_org_id != (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    -- Respeita lost_stay_in_stage (archive): quando true, não move o stage
    SELECT b.lost_stage_id INTO v_lost_stage_id
    FROM public.boards b
    JOIN public.deals d ON d.board_id = b.id
    WHERE d.id = deal_id
      AND COALESCE(b.lost_stay_in_stage, false) = false;

    UPDATE public.deals
    SET
        is_lost = TRUE,
        is_won = FALSE,
        loss_reason = COALESCE(reason, loss_reason),
        closed_at = NOW(),
        stage_id = COALESCE(v_lost_stage_id, stage_id),
        last_stage_change_date = CASE WHEN v_lost_stage_id IS NOT NULL THEN NOW() ELSE last_stage_change_date END,
        updated_at = NOW()
    WHERE id = deal_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Seed idempotente do board "Negociação"
--    UUIDs determinísticos: md5('crm-ea:<tipo>:<slug>:' || org_id)::uuid
--    → reproduzíveis entre ambientes (mesma org_id ⇒ mesmos ids).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_negociacao_board(p_org UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_board_id UUID := md5('crm-ea:board:negociacao:' || p_org::text)::uuid;
    v_existing_board_id UUID;
    v_won_id UUID;
    v_lost_id UUID;
    r RECORD;
    v_stage_id UUID;
BEGIN
    -- Board já existe com a key? (criado manualmente ou por seed anterior)
    SELECT b.id INTO v_existing_board_id
    FROM public.boards b
    WHERE b.organization_id = p_org AND b.key = 'negociacao' AND b.deleted_at IS NULL;

    IF v_existing_board_id IS NOT NULL THEN
        v_board_id := v_existing_board_id;
    ELSE
        -- ON CONFLICT sem alvo: cobre tanto colisão de PK quanto do índice
        -- parcial (org, key) em corrida de seeds concorrentes
        INSERT INTO public.boards (id, key, name, description, type, organization_id, position)
        VALUES (
            v_board_id,
            'negociacao',
            'Negociação',
            'Funil de prospecção/negociação — Novo → Contatado → Negociando → Topou proposta → Proposta enviada → Ganho/Perdido (PLANO-NOVO-FLUXO T1)',
            'SALES',
            p_org,
            0
        )
        ON CONFLICT DO NOTHING;

        -- Re-resolve o id real (pode diferir do determinístico se o board
        -- foi criado por outra via entre o SELECT e o INSERT)
        SELECT b.id INTO v_board_id
        FROM public.boards b
        WHERE b.organization_id = p_org AND b.key = 'negociacao' AND b.deleted_at IS NULL;

        IF v_board_id IS NULL THEN
            RAISE EXCEPTION 'seed_negociacao_board: falha ao criar/localizar board para org %', p_org;
        END IF;
    END IF;

    -- Estágios (ordem aprovada pela fundadora — decisão 9 do plano)
    FOR r IN
        SELECT * FROM (VALUES
            (1, 'novo',             'Novo',             '#3b82f6', false),
            (2, 'contatado',        'Contatado',        '#8b5cf6', false),
            (3, 'negociando',       'Negociando',       '#f59e0b', false),
            (4, 'topou-proposta',   'Topou proposta',   '#10b981', true ),
            (5, 'proposta-enviada', 'Proposta enviada', '#06b6d4', false),
            (6, 'ganho',            'Ganho',            '#22c55e', false),
            (7, 'perdido',          'Perdido',          '#ef4444', false)
        ) AS t(ord, slug, nome, cor, req_human)
        ORDER BY ord
    LOOP
        v_stage_id := md5('crm-ea:stage:' || r.slug || ':' || p_org::text)::uuid;

        INSERT INTO public.board_stages
            (id, board_id, name, label, color, "order", is_default, organization_id, requires_human_advance)
        VALUES
            (v_stage_id, v_board_id, r.nome, r.nome, r.cor, r.ord, r.ord = 1, p_org, r.req_human)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            label = EXCLUDED.label,
            color = EXCLUDED.color,
            "order" = EXCLUDED."order",
            is_default = EXCLUDED.is_default,
            requires_human_advance = EXCLUDED.requires_human_advance;

        IF r.slug = 'ganho'   THEN v_won_id  := v_stage_id; END IF;
        IF r.slug = 'perdido' THEN v_lost_id := v_stage_id; END IF;
    END LOOP;

    -- Semântica de fechamento do board (usada por move_deal_to_stage / UI / API pública)
    UPDATE public.boards
       SET won_stage_id = v_won_id,
           lost_stage_id = v_lost_id,
           updated_at = NOW()
     WHERE id = v_board_id
       AND (won_stage_id IS DISTINCT FROM v_won_id OR lost_stage_id IS DISTINCT FROM v_lost_id);

    -- Board Pós-venda existente ganha key estável (integrações T3+).
    -- Case/acento-insensitive; se houver mais de um match, só o mais antigo
    -- recebe a key (índice parcial (org, key) é único).
    UPDATE public.boards
       SET key = 'pos-venda', updated_at = NOW()
     WHERE id = (
        SELECT b.id FROM public.boards b
        WHERE b.organization_id = p_org
          AND b.deleted_at IS NULL
          AND b.key IS NULL
          AND lower(unaccent(b.name)) = 'pos-venda'
        ORDER BY b.created_at ASC
        LIMIT 1
     )
     AND NOT EXISTS (
        SELECT 1 FROM public.boards b2
        WHERE b2.organization_id = p_org
          AND b2.deleted_at IS NULL
          AND b2.key = 'pos-venda'
     );

    RETURN v_board_id;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_negociacao_board(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_negociacao_board(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.seed_negociacao_board(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_negociacao_board(UUID) TO service_role;

-- Aplicar em todas as orgs existentes (idempotente — re-rodar não duplica)
SELECT public.seed_negociacao_board(o.id) FROM public.organizations o;
