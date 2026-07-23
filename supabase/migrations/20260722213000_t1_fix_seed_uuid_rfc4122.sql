-- =============================================================================
-- T1 fix (ISSUE-001, achado pelo /qa 2026-07-22)
--
-- O seed gerava UUIDs por md5 cru — hex válido, mas sem os bits de
-- versão/variante do RFC 4122. O frontend valida UUID v4 estrito
-- (lib/supabase/utils.ts:37 — versão [1-5], variante [89ab]) e descartava o
-- board_id/stage_id ("Board ID é obrigatório e deve ser um UUID válido"),
-- bloqueando criação e movimentação de deals no board Negociação.
--
-- Correção: UUID determinístico com versão '4' e variante '8' forçadas
-- (continua reproduzível por org). Boards seedados com ids não-conformes e
-- SEM deals são recriados com os ids novos.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.t1_deterministic_uuid(p_seed TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    h TEXT := md5(p_seed);
BEGIN
    -- Overlay RFC 4122: 13º nibble = versão '4', 17º nibble = variante '8'
    RETURN (substr(h,1,12) || '4' || substr(h,14,3) || '8' || substr(h,18,15))::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.t1_deterministic_uuid(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.t1_deterministic_uuid(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.t1_deterministic_uuid(TEXT) TO service_role;

-- Seed corrigido: mesma lógica, ids agora RFC 4122
CREATE OR REPLACE FUNCTION public.seed_negociacao_board(p_org UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_board_id UUID := public.t1_deterministic_uuid('crm-ea:board:negociacao:' || p_org::text);
    v_existing_board_id UUID;
    v_won_id UUID;
    v_lost_id UUID;
    r RECORD;
    v_stage_id UUID;
BEGIN
    SELECT b.id INTO v_existing_board_id
    FROM public.boards b
    WHERE b.organization_id = p_org AND b.key = 'negociacao' AND b.deleted_at IS NULL;

    IF v_existing_board_id IS NOT NULL THEN
        v_board_id := v_existing_board_id;
    ELSE
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

        SELECT b.id INTO v_board_id
        FROM public.boards b
        WHERE b.organization_id = p_org AND b.key = 'negociacao' AND b.deleted_at IS NULL;

        IF v_board_id IS NULL THEN
            RAISE EXCEPTION 'seed_negociacao_board: falha ao criar/localizar board para org %', p_org;
        END IF;
    END IF;

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
        v_stage_id := public.t1_deterministic_uuid('crm-ea:stage:' || r.slug || ':' || p_org::text);

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

    UPDATE public.boards
       SET won_stage_id = v_won_id,
           lost_stage_id = v_lost_id,
           updated_at = NOW()
     WHERE id = v_board_id
       AND (won_stage_id IS DISTINCT FROM v_won_id OR lost_stage_id IS DISTINCT FROM v_lost_id);

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

-- -----------------------------------------------------------------------------
-- Recriar boards seedados com ids não-conformes (só se NÃO houver deals)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    b RECORD;
BEGIN
    FOR b IN
        SELECT bd.id, bd.organization_id
        FROM public.boards bd
        WHERE bd.key = 'negociacao'
          AND bd.deleted_at IS NULL
          -- id fora do formato RFC 4122 (mesma regra do frontend)
          AND bd.id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          -- segurança: nenhum deal no board
          AND NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.board_id = bd.id AND d.deleted_at IS NULL)
    LOOP
        -- limpar FKs won/lost antes de apagar os estágios
        UPDATE public.boards SET won_stage_id = NULL, lost_stage_id = NULL WHERE id = b.id;
        DELETE FROM public.board_stages WHERE board_id = b.id;
        DELETE FROM public.boards WHERE id = b.id;
        PERFORM public.seed_negociacao_board(b.organization_id);
    END LOOP;
END $$;

-- Garantir seed em todas as orgs (idempotente)
SELECT public.seed_negociacao_board(o.id) FROM public.organizations o;
