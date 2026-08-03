-- =============================================================================
-- T3c (emissor) — Ponte Negociação → Prospecção (reaquecimento)
--
-- Quando um deal do board "negociacao" entra no estágio "Perdido", a
-- prospecção precisa saber que aquele lead esfriou no CRM pra poder
-- reaquecer (voltar pra fila de aprovação, nova rodada de demo/abordagem).
-- Hoje isso não acontece — o lead original fica esquecido na prospecção
-- enquanto o deal já está marcado perdido no CRM.
--
-- Mesmo padrão OUTBOX do T3 (20260802120000): reusa a tabela
-- `deal_stage_events` (já genérica por `stage_slug`) e o dispatcher
-- (`deal-stage-dispatcher`, mesmo cron) em vez de criar infra nova — o
-- dispatcher passa a rotear por `stage_slug` pra um destino diferente
-- (ver alteração em supabase/functions/deal-stage-dispatcher/index.ts).
--
-- Só emite quando o deal tem origem rastreável na prospecção
-- (contacts.prospect_correlation_id = leads.id da prospecção, gravado pelo
-- T2 em 20260722230000_t2_ingest_lead_prospeccao.sql). Deal sem essa origem
-- não tem pra onde reaquecer — não é erro, é escopo: T2 só liga quem veio
-- de lá, então nem toda "perda" tem um lead de prospecção esperando de volta.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.emit_deal_lost_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_lost_stage BOOLEAN;
    v_correlation_id TEXT;
    v_contador INTEGER;
    v_external_event_id TEXT;
    v_payload JSONB;
BEGIN
    IF NEW.stage_id IS NULL OR OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
        RETURN NEW;
    END IF;

    SELECT TRUE INTO v_is_lost_stage
      FROM public.board_stages bs
      JOIN public.boards b ON b.id = bs.board_id
     WHERE bs.id = NEW.stage_id
       AND b.key = 'negociacao'
       AND b.organization_id = NEW.organization_id
       AND bs.id = public.t1_deterministic_uuid('crm-ea:stage:perdido:' || NEW.organization_id::text);

    IF NOT COALESCE(v_is_lost_stage, FALSE) THEN
        RETURN NEW;
    END IF;

    SELECT c.prospect_correlation_id INTO v_correlation_id
      FROM public.contacts c
     WHERE c.id = NEW.contact_id;

    -- Sem correlation_id, este deal não veio da prospecção (ou o contato foi
    -- criado por outra via) — nada a reaquecer, não emite evento.
    IF v_correlation_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) + 1 INTO v_contador
      FROM public.deal_stage_events
     WHERE deal_id = NEW.id AND stage_slug = 'perdido';

    v_external_event_id := 'deal:' || NEW.id::text || ':perdido:' || v_contador::text;

    v_payload := jsonb_build_object(
        'external_event_id', v_external_event_id,
        'deal_id', NEW.id,
        'correlation_id', v_correlation_id,
        'motivo', NEW.loss_reason,
        'perdido_em', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    INSERT INTO public.deal_stage_events
        (deal_id, organization_id, stage_slug, external_event_id, contador, payload)
    VALUES
        (NEW.id, NEW.organization_id, 'perdido', v_external_event_id, v_contador, v_payload)
    ON CONFLICT (external_event_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_deal_lost_event ON public.deals;
CREATE TRIGGER trg_emit_deal_lost_event
AFTER UPDATE ON public.deals
FOR EACH ROW
WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
EXECUTE FUNCTION public.emit_deal_lost_event();
