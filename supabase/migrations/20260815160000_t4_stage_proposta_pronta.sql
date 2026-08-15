-- =============================================================================
-- T4 — Estágio "Proposta pronta" + disparo automático de e-mail/WhatsApp
--
-- Novo estágio no board negociacao, entre "Topou receber proposta" (ord 4) e
-- "Proposta enviada" (ord 5). Objetivo: dar um ponto de revisão humana
-- explícito ANTES do disparo automático — o rascunho já existe desde
-- "Topou receber proposta" (T3), mas só quando um humano confirma que a
-- proposta está pronta (arrasta o card pra cá) é que o e-mail/WhatsApp sai
-- sozinho. Sem isso, automatizar a partir de "Topou receber proposta"
-- mandaria pro lead um rascunho ainda não revisado.
--
-- Segue o MESMO padrão já corrigido em T1b (20260803100000): estágio-alvo
-- identificado por id determinístico por SLUG
-- (t1_deterministic_uuid('crm-ea:stage:<slug>:'||org_id)), não por bs.name
-- literal — estável a rename de label pela UI.
--
-- requires_human_advance=true, mesmo padrão dos 8 estágios entre "Topou
-- receber proposta" e "Ganho" (ver rationale completo em T1b): a IA não tem
-- sinal confiável de que uma proposta está pronta pra sair, só um humano da
-- equipe confirma isso.
-- =============================================================================

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
            'Funil de prospecção/negociação — Novo → Contato → Negociando → Topou receber proposta → Proposta pronta → Proposta enviada → Proposta aceita → Rodar contrato → Enviar contrato → Contrato aprovado → Contrato assinado → Pagamento recebido → Ganho → Onboarding (+ Perdido) (T4, disparo automático)',
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

    -- Estágios (T4: insere "Proposta pronta" em ord 5, desloca os 9 estágios
    -- seguintes +1 — todos mantêm seu id determinístico por slug, então
    -- deals/outbox/pending-advances existentes continuam válidos).
    FOR r IN
        SELECT * FROM (VALUES
            (1,  'novo',               'Novo',                     '#3b82f6', false),
            (2,  'contatado',          'Contato',                  '#8b5cf6', false),
            (3,  'negociando',         'Negociando',               '#f59e0b', false),
            (4,  'topou-proposta',     'Topou receber proposta',   '#10b981', true ),
            (5,  'proposta-pronta',    'Proposta pronta',          '#0891b2', true ),
            (6,  'proposta-enviada',   'Proposta enviada',         '#06b6d4', true ),
            (7,  'proposta-aceita',    'Proposta aceita',          '#14b8a6', true ),
            (8,  'rodar-contrato',     'Rodar contrato',           '#6366f1', true ),
            (9,  'enviar-contrato',    'Enviar contrato',          '#a855f7', true ),
            (10, 'contrato-aprovado',  'Contrato aprovado',        '#0ea5e9', true ),
            (11, 'contrato-assinado',  'Contrato assinado',        '#0284c7', true ),
            (12, 'pagamento-recebido', 'Pagamento recebido',       '#16a34a', true ),
            (13, 'ganho',              'Ganho',                    '#22c55e', false),
            (14, 'onboarding',         'Onboarding',                '#64748b', false),
            (15, 'perdido',            'Perdido',                  '#ef4444', false)
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

-- Reaplicar em todas as orgs existentes (idempotente).
SELECT public.seed_negociacao_board(o.id) FROM public.organizations o;

-- -----------------------------------------------------------------------------
-- Trigger T3 estendido: emite um SEGUNDO tipo de evento de outbox quando o
-- deal entra em "Proposta pronta" (além do já existente pra "Topou receber
-- proposta"). Mesmo formato de contador/external_event_id, prefixo
-- diferente ('pronta' em vez de 'topou') pra não colidir.
--
-- Anti-reenvio (decisão de arquitetura, plan-eng-review 2026-08-15): esta
-- função NÃO sabe se a proposta já foi enviada — isso vive no banco do
-- Gerador de Propostas, um projeto Supabase diferente, inacessível daqui.
-- Reentrada no estágio gera novo evento (contador incrementa, mesmo padrão
-- de "topou") e o receptor em Propostas (app/api/webhooks/proposta-pronta)
-- é quem decide, olhando propostas.status, se reenvia ou não.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_deal_stage_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_slug TEXT;
    v_contador INTEGER;
    v_external_event_id TEXT;
    v_contact RECORD;
    v_payload JSONB;
BEGIN
    IF NEW.stage_id IS NULL OR OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
        RETURN NEW;
    END IF;

    -- Qual dos dois estágios-alvo (se algum) o deal acabou de entrar.
    IF NEW.stage_id = public.t1_deterministic_uuid('crm-ea:stage:topou-proposta:' || NEW.organization_id::text) THEN
        v_target_slug := 'topou-proposta';
    ELSIF NEW.stage_id = public.t1_deterministic_uuid('crm-ea:stage:proposta-pronta:' || NEW.organization_id::text) THEN
        v_target_slug := 'proposta-pronta';
    ELSE
        RETURN NEW;
    END IF;

    -- Confirma que o stage_id realmente pertence ao board negociacao dessa
    -- org (defesa contra colisão improvável de hash entre orgs/boards).
    IF NOT EXISTS (
        SELECT 1 FROM public.board_stages bs
        JOIN public.boards b ON b.id = bs.board_id
        WHERE bs.id = NEW.stage_id
          AND b.key = 'negociacao'
          AND b.organization_id = NEW.organization_id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) + 1 INTO v_contador
      FROM public.deal_stage_events
     WHERE deal_id = NEW.id
       AND stage_slug = v_target_slug;

    v_external_event_id := 'deal:' || NEW.id::text || ':' ||
        (CASE WHEN v_target_slug = 'topou-proposta' THEN 'topou' ELSE 'pronta' END) ||
        ':' || v_contador::text;

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
        (NEW.id, NEW.organization_id, v_target_slug, v_external_event_id, v_contador, v_payload)
    ON CONFLICT (external_event_id) DO NOTHING;

    RETURN NEW;
END;
$$;
-- Trigger em si não muda (mesma função, mesmo nome).

-- -----------------------------------------------------------------------------
-- organization_settings.auto_send_proposal_whatsapp — liga/desliga por org,
-- mesmo padrão de whatsapp_kill_switch_active (lib/messaging/
-- whatsapp-send-guard.ts). Default false: prospecção hoje é majoritariamente
-- manual no WhatsApp, automação é opt-in quando o fluxo estiver maduro.
-- -----------------------------------------------------------------------------
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS auto_send_proposal_whatsapp BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organization_settings.auto_send_proposal_whatsapp IS
  'T4: dispara WhatsApp automático (via ChannelRouterService) quando deal entra em "Proposta pronta". Default false — opt-in por org.';

-- -----------------------------------------------------------------------------
-- deals.proposal_link — link público da proposta (share_token do Gerador de
-- Propostas), persistido aqui quando o webhook T3b (evento 'enviada')
-- chega. Alimenta o botão manual de WhatsApp e o disparo automático, sem
-- round-trip pro outro projeto no momento do envio.
-- -----------------------------------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS proposal_link TEXT;

COMMENT ON COLUMN public.deals.proposal_link IS
  'T4: link público da proposta comercial (Gerador de Propostas), persistido via webhook T3b evento "enviada".';
