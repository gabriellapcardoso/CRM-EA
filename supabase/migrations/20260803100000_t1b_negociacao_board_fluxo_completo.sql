-- =============================================================================
-- T1b — Expansão do board "Negociação" pro fluxo completo (decisão da
-- fundadora, 2026-08-02/03). Substitui a lista de 7 estágios de
-- seed_negociacao_board (20260722210000_t1_negociacao_board_semantics.sql,
-- corrigida em 20260722213000_t1_fix_seed_uuid_rfc4122.sql) por 14 estágios:
--
--   Novo → Contato → Negociando → Topou receber proposta → Proposta enviada
--   → Proposta aceita → Rodar contrato → Enviar contrato → Contrato aprovado
--   → Contrato assinado → Pagamento recebido → Ganho → Onboarding
--   (+ Perdido, que já existia e permanece no board)
--
-- NÃO edita as migrations antigas (histórico já aplicado). Só faz
-- CREATE OR REPLACE de seed_negociacao_board com a lista nova — mesmo padrão
-- já usado por 20260722213000 pra corrigir o formato de UUID. UPSERT por id
-- determinístico (t1_deterministic_uuid('crm-ea:stage:<slug>:' || org_id),
-- fórmula RFC4122 introduzida em 20260722213000 — NÃO é md5 cru) preserva os
-- ids dos 7 estágios já existentes; os 7 novos (slugs abaixo) são inseridos.
--
-- Estágios que MUDAM: 'contatado' (label "Contatado" → "Contato", slug
-- intacto), 'topou-proposta' (label "Topou proposta" → "Topou receber
-- proposta", slug intacto — deals/pending-advances/outbox que referenciam o
-- id continuam válidos). 'ganho' e 'perdido' mudam só de order (posição no
-- board), não de id/label/requires_human_advance.
--
-- -----------------------------------------------------------------------------
-- Decisão: requires_human_advance nos 7 estágios novos
-- -----------------------------------------------------------------------------
-- requires_human_advance só é lido em dois lugares (lib/ai/agent/
-- stage-evaluator.ts:381, lib/ai/tools.ts:713) — SEMPRE no caminho em que o
-- PRÓPRIO agente IA decide avançar um deal a partir da conversa com o lead.
-- Não é lido pelo dispatcher de webhook (T3), nem pelo cockpit quando um
-- humano arrasta o card (UPDATE direto, ver comentário em
-- 20260802120000_t3_deal_stage_events_outbox.sql). Ou seja: marcar um
-- estágio com requires_human_advance=false NÃO conecta automação nenhuma —
-- só permite que a IA, sozinha, mova um deal pra lá sem aprovação.
--
-- O enunciado desta tarefa sugere que 'Proposta enviada', 'Proposta aceita'
-- e 'Pagamento recebido' poderiam ter requires_human_advance=false por já
-- serem (ou virem a ser, no caso de T3b) movidos por webhook. Decisão
-- tomada: NÃO seguir essa sugestão — mantive requires_human_advance=true em
-- TODOS os 8 estágios entre 'Topou receber proposta' e 'Ganho' (inclusive),
-- pelo motivo acima: a IA conversa só com o lead pelo WhatsApp, não tem
-- nenhum sinal confiável de que uma proposta foi de fato enviada, aceita,
-- que o contrato foi rodado/enviado/aprovado/assinado, ou que o pagamento
-- caiu — todos esses são fatos que só um sistema externo (webhook) ou um
-- humano da equipe podem confirmar. Deixar a IA avançar esses estágios
-- sozinha por inferência de conversa arrisca o board mostrar estado que não
-- aconteceu de verdade (ex.: IA "acha" que o pagamento caiu porque o lead
-- disse "vou pagar hoje"). Como a flag não afeta o caminho do webhook nem o
-- do humano arrastando o card, travar a IA aqui não atrasa nem interfere na
-- automação futura (T3b) nem na já existente (pagamento_recebido) — só
-- reduz o risco de a IA inventar estado. 'novo'/'contatado'/'negociando'
-- seguem false (a IA já opera nesses estágios hoje, isso não muda).
-- 'ganho'/'perdido' seguem false (fechamento já é feito por
-- mark_deal_won/mark_deal_lost, caminho separado do agente). 'onboarding' é
-- pós-venda operacional (equipe, não IA de negociação) — segue false, no
-- mesmo padrão de 'ganho'.
--
-- -----------------------------------------------------------------------------
-- Caveat conhecido, NÃO resolvido nesta migration (fora de escopo — decisão
-- de produto pendente, registrar em TODOS.md/DESAFIOS.md):
-- -----------------------------------------------------------------------------
-- move_deal_to_stage (T1) trata "mover para fora do estágio Ganho" como
-- reabertura do deal: is_won volta a false e closed_at volta a NULL (regra
-- "mover para estágio comum reabre o deal"). Com 'Onboarding' agora vindo
-- DEPOIS de 'Ganho' no board, mover um deal de Ganho → Onboarding via essa
-- RPC vai reabrir o deal (is_won=false) mesmo ele continuando
-- efetivamente ganho — só entrando na fase de onboarding. O cockpit (drag
-- direto na tabela) não aciona essa RPC, então hoje isso só afeta chamadas
-- futuras da IA/API que passem a usar move_deal_to_stage para avançar até
-- Onboarding. Não foi corrigido aqui porque a correção correta depende de
-- decisão de produto (Onboarding deveria contar como "ainda ganho"? um
-- won_stage_id vira um "won stage set"? etc.) fora do escopo desta task.
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
            'Funil de prospecção/negociação — Novo → Contato → Negociando → Topou receber proposta → Proposta enviada → Proposta aceita → Rodar contrato → Enviar contrato → Contrato aprovado → Contrato assinado → Pagamento recebido → Ganho → Onboarding (+ Perdido) (T1b, fluxo completo)',
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

    -- Estágios (fluxo completo aprovado pela fundadora, 2026-08-02/03 — T1b)
    FOR r IN
        SELECT * FROM (VALUES
            (1,  'novo',               'Novo',                     '#3b82f6', false),
            (2,  'contatado',          'Contato',                  '#8b5cf6', false),
            (3,  'negociando',         'Negociando',               '#f59e0b', false),
            (4,  'topou-proposta',     'Topou receber proposta',   '#10b981', true ),
            (5,  'proposta-enviada',   'Proposta enviada',         '#06b6d4', true ),
            (6,  'proposta-aceita',    'Proposta aceita',          '#14b8a6', true ),
            (7,  'rodar-contrato',     'Rodar contrato',           '#6366f1', true ),
            (8,  'enviar-contrato',    'Enviar contrato',          '#a855f7', true ),
            (9,  'contrato-aprovado',  'Contrato aprovado',        '#0ea5e9', true ),
            (10, 'contrato-assinado',  'Contrato assinado',        '#0284c7', true ),
            (11, 'pagamento-recebido', 'Pagamento recebido',       '#16a34a', true ),
            (12, 'ganho',              'Ganho',                    '#22c55e', false),
            (13, 'onboarding',         'Onboarding',                '#64748b', false),
            (14, 'perdido',            'Perdido',                  '#ef4444', false)
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

-- Reaplicar em todas as orgs existentes (idempotente — reconciliação: 7
-- estágios existentes mantêm id/são atualizados, 7 novos são inseridos).
SELECT public.seed_negociacao_board(o.id) FROM public.organizations o;

-- -----------------------------------------------------------------------------
-- T3 (emissor) — fix: identificar o estágio-alvo por id determinístico
-- (equivalente a "por slug", já que não existe coluna slug em board_stages)
-- em vez de nome literal 'Topou proposta', que deixou de existir com o
-- rename do label pra 'Topou receber proposta' (ver 20260802120000_t3_deal_
-- stage_events_outbox.sql, emit_deal_stage_event — usava bs.name literal).
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
    IF NEW.stage_id IS NULL OR OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
        RETURN NEW;
    END IF;

    -- Estágio-alvo = id determinístico do slug 'topou-proposta' pra essa org
    -- (estável mesmo com rename de label — não depende mais de bs.name).
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
-- Trigger em si não muda (mesma função, mesmo nome) — CREATE OR REPLACE da
-- function já é suficiente, sem precisar recriar o trigger.
