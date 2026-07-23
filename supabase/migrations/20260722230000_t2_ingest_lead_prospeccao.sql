-- ============================================================================
-- T2 — Prospecção → CRM em modo rascunho (PLANO-NOVO-FLUXO.md, decisão 7 + design Codex)
--
-- RPC transacional `ingest_lead_prospeccao`: numa transação única cria/acha
-- contato (por correlation_id + telefone E.164), cria/reusa deal no board de
-- entrada da fonte, vincula messaging_conversation (quando existe canal
-- WhatsApp) e grava a 1ª mensagem como RASCUNHO (status 'draft' — nunca
-- enviada até ação explícita pós-T4). Elimina o estado parcial envenenado do
-- webhook-in não-transacional.
--
-- Também: status 'draft' no CHECK de messaging_messages, coluna de correlação
-- estável em contacts (contact.id do CRM é instável pra merge) e RPC de
-- reconciliação por chave de correlação.
-- ============================================================================

-- 1) Status 'draft' em messaging_messages -----------------------------------
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.messaging_messages'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%pending%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.messaging_messages DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE public.messaging_messages
    ADD CONSTRAINT messaging_messages_status_check
    CHECK (status IN ('draft', 'pending', 'queued', 'sent', 'delivered', 'read', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Correlação estável cross-sistema em contacts ---------------------------
-- `prospect_correlation_id` = id do lead na prospecção. Identidade estável
-- entre os sistemas (achado eng review: contact.id do CRM não serve pra merge).
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS prospect_correlation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_prospect_correlation
  ON public.contacts(organization_id, prospect_correlation_id)
  WHERE prospect_correlation_id IS NOT NULL AND deleted_at IS NULL;

-- 3) Normalização E.164 defensiva no banco ----------------------------------
-- O emissor já normaliza; esta é a segunda linha de defesa (payload de outra
-- origem, edição manual). Retorna NULL quando não é um telefone BR plausível.
CREATE OR REPLACE FUNCTION public.t2_normalize_phone_br(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_digits TEXT;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_phone, '\D', '', 'g');
  v_digits := regexp_replace(v_digits, '^0+', '');
  IF length(v_digits) IN (10, 11) THEN
    RETURN '+55' || v_digits;
  ELSIF length(v_digits) IN (12, 13) AND v_digits LIKE '55%' THEN
    RETURN '+' || v_digits;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.t2_normalize_phone_br(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.t2_normalize_phone_br(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.t2_normalize_phone_br(TEXT) TO service_role;

-- 4) RPC transacional de ingestão -------------------------------------------
-- Chamada SÓ pela edge function `ingest-prospeccao` (service_role). O contrato
-- do payload é a fixture compartilhada (HANDOFF.md do gerador de propostas).
--
-- Erros com prefixo T2_ são de contrato/estado e mapeados pela edge function:
--   T2_DUPLICATE_IN_FLIGHT → 409 (corrida de retry: evento existe sem deal)
--   T2_INVALID_*           → 422
CREATE OR REPLACE FUNCTION public.ingest_lead_prospeccao(
  p_source_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_event_id TEXT;
  v_correlation TEXT;
  v_ciclo INTEGER;
  v_phone TEXT;
  v_phone_digits TEXT;
  v_nome TEXT;
  v_email TEXT;
  v_msg TEXT;
  v_evt_id UUID;
  v_existing RECORD;
  v_contact_id UUID;
  v_deal_id UUID;
  v_deal_action TEXT := 'created';
  v_channel RECORD;
  v_conversation_id UUID;
  v_message_id UUID;
  v_draft_local TEXT := 'message';
  v_prospeccao_meta JSONB;
BEGIN
  -- Guard: apenas service_role (a edge function é quem autentica o secret da fonte)
  IF COALESCE(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true)) IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT id, organization_id, entry_board_id, entry_stage_id, active
    INTO v_source
    FROM integration_inbound_sources
   WHERE id = p_source_id;
  IF v_source.id IS NULL OR NOT v_source.active THEN
    RAISE EXCEPTION 'T2_INVALID_SOURCE';
  END IF;

  v_event_id    := NULLIF(trim(p_payload ->> 'external_event_id'), '');
  v_correlation := NULLIF(trim(p_payload ->> 'correlation_id'), '');
  v_ciclo       := COALESCE((p_payload ->> 'ciclo')::INTEGER, 0);
  v_nome        := NULLIF(trim(p_payload -> 'lead' ->> 'nome'), '');
  v_email       := NULLIF(lower(trim(p_payload -> 'lead' ->> 'email')), '');
  v_msg         := NULLIF(p_payload ->> 'mensagem_whatsapp', '');
  v_phone       := t2_normalize_phone_br(p_payload -> 'lead' ->> 'telefone');

  IF v_event_id IS NULL OR v_correlation IS NULL OR v_nome IS NULL THEN
    RAISE EXCEPTION 'T2_INVALID_PAYLOAD';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'T2_INVALID_PHONE';
  END IF;
  v_phone_digits := regexp_replace(v_phone, '\D', '', 'g');

  -- Idempotência transacional por (source, external_event_id) = chave de ciclo.
  -- Como TUDO roda nesta transação, o evento só fica gravado se o deal também
  -- ficou — falha no meio faz rollback completo (nada de estado parcial).
  INSERT INTO webhook_events_in (organization_id, source_id, provider, external_event_id, payload, status)
  VALUES (v_source.organization_id, v_source.id, 'prospeccao', v_event_id, p_payload, 'received')
  ON CONFLICT (source_id, external_event_id) WHERE external_event_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_evt_id;

  IF v_evt_id IS NULL THEN
    SELECT created_contact_id, created_deal_id INTO v_existing
      FROM webhook_events_in
     WHERE source_id = v_source.id AND external_event_id = v_event_id;
    IF v_existing.created_deal_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true, 'duplicate', true,
        'contact_id', v_existing.created_contact_id,
        'deal_id', v_existing.created_deal_id
      );
    END IF;
    -- Evento existe sem deal: outro processamento em andamento (corrida de retry)
    RAISE EXCEPTION 'T2_DUPLICATE_IN_FLIGHT';
  END IF;

  -- Contato: correlação primeiro (identidade estável), telefone depois
  SELECT id INTO v_contact_id
    FROM contacts
   WHERE organization_id = v_source.organization_id
     AND deleted_at IS NULL
     AND prospect_correlation_id = v_correlation
   LIMIT 1;

  IF v_contact_id IS NULL THEN
    SELECT id INTO v_contact_id
      FROM contacts
     WHERE organization_id = v_source.organization_id
       AND deleted_at IS NULL
       AND (phone = v_phone OR regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_phone_digits)
     ORDER BY created_at
     LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    INSERT INTO contacts (organization_id, name, email, phone, source, prospect_correlation_id)
    VALUES (v_source.organization_id, v_nome, v_email, v_phone, 'prospeccao', v_correlation)
    RETURNING id INTO v_contact_id;
  ELSE
    -- Preenche só o que está vazio (não sobrescreve trabalho da fundadora/agente)
    UPDATE contacts
       SET name  = CASE WHEN name IS NULL OR name = '' OR name = 'Sem nome' THEN v_nome ELSE name END,
           email = COALESCE(email, v_email),
           phone = COALESCE(phone, v_phone),
           prospect_correlation_id = COALESCE(prospect_correlation_id, v_correlation)
     WHERE id = v_contact_id;
  END IF;

  v_prospeccao_meta := jsonb_build_object(
    'correlation_id', v_correlation,
    'ciclo', v_ciclo,
    'external_event_id', v_event_id,
    'demo_link', p_payload -> 'demo' ->> 'link',
    'demo_tipo', p_payload -> 'demo' ->> 'tipo',
    'motor', p_payload -> 'lead' ->> 'motor',
    'origem', p_payload ->> 'origem'
  );

  -- Deal: reusa o aberto no mesmo board (lookup já filtra fechados — reentrada
  -- de reaquecimento cria deal novo porque o anterior está is_lost/is_won)
  SELECT id INTO v_deal_id
    FROM deals
   WHERE organization_id = v_source.organization_id
     AND board_id = v_source.entry_board_id
     AND contact_id = v_contact_id
     AND is_won = false AND is_lost = false
     AND deleted_at IS NULL
   ORDER BY updated_at DESC
   LIMIT 1;

  IF v_deal_id IS NOT NULL THEN
    v_deal_action := 'updated';
    -- MERGE de custom_fields (nunca sobrescrever o JSONB inteiro — achado do hardening)
    UPDATE deals
       SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object('prospeccao', v_prospeccao_meta),
           updated_at = now()
     WHERE id = v_deal_id;
  ELSE
    INSERT INTO deals (
      organization_id, title, value, probability, priority,
      board_id, stage_id, contact_id, last_stage_change_date, tags, custom_fields
    ) VALUES (
      v_source.organization_id, v_nome, 0, 10, 'medium',
      v_source.entry_board_id, v_source.entry_stage_id, v_contact_id, now(), ARRAY['Prospecção'],
      jsonb_build_object('prospeccao', v_prospeccao_meta)
    )
    RETURNING id INTO v_deal_id;
  END IF;

  -- Rascunho da 1ª mensagem WhatsApp. Com canal ativo: conversa vinculada ao
  -- deal/contato + mensagem 'draft' (resolve o achado "deal sem conversa
  -- quebra transições automáticas"). Sem canal (pré-T4): rascunho fica no
  -- custom_fields do deal, materializável quando o canal existir.
  IF v_msg IS NOT NULL THEN
    SELECT id, business_unit_id INTO v_channel
      FROM messaging_channels
     WHERE organization_id = v_source.organization_id
       AND channel_type = 'whatsapp'
       AND status = 'active'
     ORDER BY created_at
     LIMIT 1;

    IF v_channel.id IS NOT NULL THEN
      INSERT INTO messaging_conversations (
        organization_id, channel_id, business_unit_id, contact_id, external_contact_id, status
      ) VALUES (
        v_source.organization_id, v_channel.id, v_channel.business_unit_id, v_contact_id, v_phone_digits, 'open'
      )
      ON CONFLICT (channel_id, external_contact_id)
      DO UPDATE SET contact_id = COALESCE(messaging_conversations.contact_id, EXCLUDED.contact_id)
      RETURNING id INTO v_conversation_id;

      INSERT INTO messaging_messages (conversation_id, direction, content_type, content, status, metadata)
      VALUES (
        v_conversation_id, 'outbound', 'text',
        jsonb_build_object('text', v_msg),
        'draft',
        jsonb_build_object('origin', 'prospeccao', 'external_event_id', v_event_id)
      )
      RETURNING id INTO v_message_id;
    ELSE
      v_draft_local := 'deal_custom_fields';
      UPDATE deals
         SET custom_fields = COALESCE(custom_fields, '{}'::jsonb)
             || jsonb_build_object('prospeccao', v_prospeccao_meta || jsonb_build_object(
                  'draft_whatsapp_message', v_msg,
                  'draft_pending_channel', true
                ))
       WHERE id = v_deal_id;
    END IF;
  END IF;

  UPDATE webhook_events_in
     SET status = 'processed', created_contact_id = v_contact_id, created_deal_id = v_deal_id
   WHERE id = v_evt_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'contact_id', v_contact_id,
    'deal_id', v_deal_id,
    'deal_action', v_deal_action,
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'draft_stored_in', v_draft_local
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_lead_prospeccao(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_lead_prospeccao(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.ingest_lead_prospeccao(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_lead_prospeccao(UUID, JSONB) TO service_role;

-- 5) RPC de reconciliação por chave de correlação ---------------------------
-- Devolve quais correlation_ids têm deal no CRM (qualquer estado). Base do job
-- de reconciliação da prospecção (lista acionável de faltantes, não contagem).
CREATE OR REPLACE FUNCTION public.reconcile_prospeccao(
  p_source_id UUID,
  p_correlation_ids TEXT[]
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_found TEXT[];
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true)) IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO v_org FROM integration_inbound_sources WHERE id = p_source_id AND active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'T2_INVALID_SOURCE';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c.prospect_correlation_id), '{}')
    INTO v_found
    FROM contacts c
    JOIN deals d ON d.contact_id = c.id AND d.deleted_at IS NULL
   WHERE c.organization_id = v_org
     AND c.deleted_at IS NULL
     AND c.prospect_correlation_id = ANY(p_correlation_ids);

  RETURN v_found;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_prospeccao(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_prospeccao(UUID, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_prospeccao(UUID, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_prospeccao(UUID, TEXT[]) TO service_role;
