-- RPC transacional: converte um contato em deal, puxando os interesses de
-- produto pendentes como deal_items (snapshot), somando o valor no deal e
-- marcando os interesses como convertidos — tudo numa transação só.
--
-- Substitui o caminho client-side (cria deal, depois cria items em request
-- separado) por uma operação atômica: evita deal-sem-items em caso de falha
-- parcial, resolve deal.value ficar 0 quando há items, e usa FOR UPDATE
-- SKIP LOCKED nos interesses pendentes para não duplicar deal em duplo-clique
-- ou duas abas simultâneas convertendo o mesmo contato.

CREATE OR REPLACE FUNCTION convert_contact_to_deal(
  p_contact_id UUID,
  p_board_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_contact RECORD;
  v_board RECORD;
  v_stage RECORD;
  v_deal_id UUID;
  v_deal_value NUMERIC := 0;
  v_items_count INTEGER := 0;
  v_interest RECORD;
BEGIN
  v_caller_id := auth.uid();

  -- Lock do contato: impede duplo-clique/duas abas convertendo o mesmo
  -- contato simultaneamente em dois deals.
  SELECT * INTO v_contact FROM contacts
  WHERE id = p_contact_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_contact IS NULL THEN
    RAISE EXCEPTION 'Contato não encontrado ou removido';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller_id AND organization_id = v_contact.organization_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_board FROM boards
  WHERE id = p_board_id AND organization_id = v_contact.organization_id;

  IF v_board IS NULL THEN
    RAISE EXCEPTION 'Board não encontrado nesta organização';
  END IF;

  SELECT * INTO v_stage FROM board_stages
  WHERE board_id = p_board_id
  ORDER BY "order" ASC
  LIMIT 1;

  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'Board não tem estágios configurados';
  END IF;

  -- 1. Cria o deal (sem items/value ainda — calculados abaixo)
  INSERT INTO deals (
    title, contact_id, client_company_id, board_id, stage_id, status,
    value, probability, priority, tags, custom_fields, owner_id,
    is_won, is_lost, organization_id
  ) VALUES (
    'Deal - ' || v_contact.name,
    v_contact.id,
    v_contact.client_company_id,
    v_board.id,
    v_stage.id,
    v_stage.id,
    0,
    0,
    'medium',
    '{}',
    '{}',
    v_caller_id,
    FALSE,
    FALSE,
    v_contact.organization_id
  )
  RETURNING id INTO v_deal_id;

  -- 2. Lock nos interesses pendentes do contato (SKIP LOCKED: se outra
  -- transação concorrente já está convertendo o mesmo contato e travou essas
  -- linhas, esta chamada simplesmente não os vê — evita deadlock/espera).
  FOR v_interest IN
    SELECT cpi.id, cpi.observacao, p.name AS product_name, p.price AS product_price
    FROM contact_product_interests cpi
    JOIN products p ON p.id = cpi.product_id
    WHERE cpi.contact_id = p_contact_id AND cpi.converted_at IS NULL
    FOR UPDATE OF cpi SKIP LOCKED
  LOOP
    INSERT INTO deal_items (deal_id, product_id, name, quantity, price, notes, organization_id)
    SELECT v_deal_id, cpi.product_id, v_interest.product_name, 1, v_interest.product_price,
           v_interest.observacao, v_contact.organization_id
    FROM contact_product_interests cpi
    WHERE cpi.id = v_interest.id;

    v_deal_value := v_deal_value + v_interest.product_price;
    v_items_count := v_items_count + 1;

    UPDATE contact_product_interests
    SET converted_at = NOW(), converted_deal_id = v_deal_id
    WHERE id = v_interest.id;
  END LOOP;

  -- 3. Recalcula o valor do deal a partir dos itens (evita deal.value = 0
  -- com deal_items preenchidos — bug que já existia no caminho client-side).
  IF v_items_count > 0 THEN
    UPDATE deals SET value = v_deal_value, updated_at = NOW() WHERE id = v_deal_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dealId', v_deal_id,
    'boardId', v_board.id,
    'stageId', v_stage.id,
    'itemsCount', v_items_count,
    'value', v_deal_value
  );
END;
$$;
