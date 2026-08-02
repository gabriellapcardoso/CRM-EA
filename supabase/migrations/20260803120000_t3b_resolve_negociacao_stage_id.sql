-- =============================================================================
-- T3b — Ponte "Gerador de Propostas → CRM (webhook-in)" para os eventos
-- 'enviada'/'aprovada'/'pagamento_recebido' (webhook irmão do T3, mesma
-- direção Propostas→CRM). Estende o payload de webhook-in com
-- target_stage_slug: qual estágio do board "negociação" o deal deve ocupar.
--
-- board_stages não tem coluna slug (comentário em
-- 20260722210000_t1_negociacao_board_semantics.sql) — o id do estágio é
-- determinístico via t1_deterministic_uuid('crm-ea:stage:<slug>:<org_id>').
-- Em vez de expor t1_deterministic_uuid (uso genérico, sem validação) direto
-- pra Edge Function, esta função:
--   1. calcula o id candidato a partir do slug recebido no payload externo
--      (dado não confiável — vem de fora do banco);
--   2. confirma que esse id É um estágio real do board 'negociacao' da
--      mesma org antes de devolver — um slug inválido/desatualizado
--      simplesmente retorna NULL, e o caller (webhook-in) trata isso como
--      "não mover estágio" em vez de propagar um id fantasma pro deal.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_negociacao_stage_id(p_org UUID, p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stage_id UUID;
BEGIN
    IF p_org IS NULL OR p_slug IS NULL OR btrim(p_slug) = '' THEN
        RETURN NULL;
    END IF;

    v_stage_id := public.t1_deterministic_uuid('crm-ea:stage:' || p_slug || ':' || p_org::text);

    IF NOT EXISTS (
        SELECT 1
          FROM public.board_stages bs
          JOIN public.boards b ON b.id = bs.board_id
         WHERE bs.id = v_stage_id
           AND b.key = 'negociacao'
           AND b.organization_id = p_org
           AND b.deleted_at IS NULL
    ) THEN
        RETURN NULL;
    END IF;

    RETURN v_stage_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_negociacao_stage_id(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_negociacao_stage_id(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_negociacao_stage_id(UUID, TEXT) TO service_role;
