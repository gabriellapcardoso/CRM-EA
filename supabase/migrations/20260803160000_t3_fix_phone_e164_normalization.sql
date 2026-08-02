-- Achado no /qa (2026-08-03): o trigger emit_deal_stage_event passava
-- v_contact.phone direto pro payload sem normalizar pra E.164. O receptor
-- (gerador de propostas) exige formato E.164 estrito (regex com '+' obrigatório)
-- e rejeitava com 422 qualquer telefone salvo sem o prefixo '+' — que é o
-- formato real dos contatos existentes neste banco (ex: "5511999999999").
-- Sem esse fix, TODO deal com telefone preenchido do jeito que já está salvo
-- no banco falharia o T3 silenciosamente (evento fica "falhou" na outbox).
--
-- Base desta função: a versão de 20260803100000_t1b_negociacao_board_fluxo_
-- completo.sql (identifica estágio-alvo por id determinístico do slug, não
-- por nome literal). Único diff real: normalização de telefone.
--
-- Normalização: só adiciona '+' quando o telefone já parece E.164 sem o
-- prefixo (10-15 dígitos). Não tenta adivinhar DDI pra números sem formato
-- de E.164 completo — esses continuam null no payload, igual comportamento
-- já existente pra telefone ausente (receptor trata como opcional).

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
    v_phone_e164 TEXT;
BEGIN
    IF NEW.stage_id IS NULL OR OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
        RETURN NEW;
    END IF;

    SELECT TRUE INTO v_is_target_stage
      FROM public.board_stages bs
      JOIN public.boards b ON b.id = bs.board_id
     WHERE bs.id = NEW.stage_id
       AND b.key = 'negociacao'
       AND b.organization_id = NEW.organization_id
       AND bs.id = public.t1_deterministic_uuid('crm-ea:stage:topou-proposta:' || NEW.organization_id::text);

    IF NOT COALESCE(v_is_target_stage, FALSE) THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) + 1 INTO v_contador
      FROM public.deal_stage_events
     WHERE deal_id = NEW.id;

    v_external_event_id := 'deal:' || NEW.id::text || ':topou:' || v_contador::text;

    SELECT c.name, c.phone, c.email, c.company_name
      INTO v_contact
      FROM public.contacts c
     WHERE c.id = NEW.contact_id;

    -- Normaliza pra E.164: já tem '+' -> mantém; só dígitos com 10-15 chars -> prefixa '+'; resto -> null
    v_phone_e164 := NULL;
    IF v_contact.phone IS NOT NULL THEN
        IF v_contact.phone ~ '^\+\d{10,15}$' THEN
            v_phone_e164 := v_contact.phone;
        ELSIF v_contact.phone ~ '^\d{10,15}$' THEN
            v_phone_e164 := '+' || v_contact.phone;
        END IF;
    END IF;

    v_payload := jsonb_build_object(
        'external_event_id', v_external_event_id,
        'deal_id', NEW.id,
        'contador', v_contador,
        'organization_id', NEW.organization_id,
        'contact', jsonb_build_object(
            'nome', COALESCE(v_contact.name, NULL),
            'telefone', v_phone_e164,
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
