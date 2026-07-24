-- ============================================================================
-- pgTAP: RPC ingest_lead_prospeccao (T2)
-- Gate P1 pendente registrado em TODOS.md (gerador de propostas comerciai)
-- Cobre: caminho feliz, replay idempotente, corrida (T2_DUPLICATE_IN_FLIGHT),
-- telefone formatado normalizando certo, fonte inativa/inexistente.
-- ============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(11);

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Org Teste T2');

INSERT INTO boards (id, organization_id, key, name, is_default) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'negociacao', 'Negociação', true);

INSERT INTO board_stages (id, board_id, organization_id, name, "order", is_default) VALUES
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Novo', 1, true);

INSERT INTO integration_inbound_sources (id, organization_id, name, entry_board_id, entry_stage_id, secret, active) VALUES
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Prospecção Teste', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'segredo-teste', true);

INSERT INTO integration_inbound_sources (id, organization_id, name, entry_board_id, entry_stage_id, secret, active) VALUES
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Fonte Inativa', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'segredo-teste', false);

-- payload de fixture (mesmo formato de prospeccao-aaagencia/lib/fixtures/t2-payload.json)
-- telefone propositalmente "sujo" pra testar t2_normalize_phone_br
\set payload '''{"external_event_id":"lead:aaaaaaaa-0000-0000-0000-000000000001:demo:0","correlation_id":"aaaaaaaa-0000-0000-0000-000000000001","ciclo":0,"origem":"prospeccao-aaagencia","lead":{"nome":"Lead Teste","telefone":"(31) 98888-7777","email":null,"instagram":null,"motor":"pagina","nota":4.8,"motivo":"sem site"},"demo":{"link":"https://exemplo.com/","tipo":"link"},"mensagem_whatsapp":"Oi! Vi seu negócio e montei uma demo.","mensagem_email":"Assunto: teste","enviado_em":"2026-07-23T12:00:00.000Z"}''::jsonb'

-- ----------------------------------------------------------------------------
-- 1) Fonte inativa: RAISE T2_INVALID_SOURCE
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT ingest_lead_prospeccao(%L::uuid, %s)', '00000000-0000-0000-0000-000000000005', :payload),
  'T2_INVALID_SOURCE',
  'fonte inativa deve rejeitar com T2_INVALID_SOURCE'
);

-- ----------------------------------------------------------------------------
-- 2) Caminho feliz: cria contato + deal em "Novo" + rascunho (sem canal WhatsApp ativo -> custom_fields)
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  format('SELECT ingest_lead_prospeccao(%L::uuid, %s)', '00000000-0000-0000-0000-000000000004', :payload),
  'caminho feliz não deve lançar exceção'
);

SELECT is(
  (SELECT count(*)::int FROM contacts WHERE prospect_correlation_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'contato criado com prospect_correlation_id correto'
);

SELECT is(
  (SELECT phone FROM contacts WHERE prospect_correlation_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '+553198887777',
  't2_normalize_phone_br normaliza "(31) 98888-7777" para +553198887777'
);

SELECT is(
  (SELECT d.stage_id::text FROM deals d
     JOIN contacts c ON c.id = d.contact_id
    WHERE c.prospect_correlation_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000000003',
  'deal criado no estágio de entrada da fonte ("Novo")'
);

SELECT is(
  (SELECT d.custom_fields -> 'prospeccao' ->> 'draft_whatsapp_message' FROM deals d
     JOIN contacts c ON c.id = d.contact_id
    WHERE c.prospect_correlation_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Oi! Vi seu negócio e montei uma demo.',
  'sem canal WhatsApp ativo, rascunho fica em custom_fields.prospeccao.draft_whatsapp_message'
);

-- ----------------------------------------------------------------------------
-- 3) Replay da mesma chave: idempotente, retorna duplicate=true, NÃO cria 2º contato/deal
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT ingest_lead_prospeccao('00000000-0000-0000-0000-000000000004'::uuid, :payload) ->> 'duplicate'),
  'true',
  'replay do mesmo external_event_id retorna duplicate=true'
);

SELECT is(
  (SELECT count(*)::int FROM contacts WHERE prospect_correlation_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'replay não duplica o contato'
);

SELECT is(
  (SELECT count(*)::int FROM deals d JOIN contacts c ON c.id = d.contact_id
    WHERE c.prospect_correlation_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'replay não duplica o deal'
);

-- ----------------------------------------------------------------------------
-- 4) Corrida: evento pré-inserido sem deal (created_deal_id NULL) -> T2_DUPLICATE_IN_FLIGHT
-- ----------------------------------------------------------------------------
INSERT INTO webhook_events_in (organization_id, source_id, provider, external_event_id, payload, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000004',
  'prospeccao',
  'lead:bbbbbbbb-0000-0000-0000-000000000002:demo:0',
  '{}'::jsonb,
  'received'
);

SELECT throws_ok(
  format(
    'SELECT ingest_lead_prospeccao(%L::uuid, %s)',
    '00000000-0000-0000-0000-000000000004',
    '''{"external_event_id":"lead:bbbbbbbb-0000-0000-0000-000000000002:demo:0","correlation_id":"bbbbbbbb-0000-0000-0000-000000000002","ciclo":0,"origem":"prospeccao-aaagencia","lead":{"nome":"Lead Corrida","telefone":"+5531988887778"},"demo":{},"mensagem_whatsapp":"oi"}''::jsonb'
  ),
  'T2_DUPLICATE_IN_FLIGHT',
  'evento em processamento (sem deal) rejeita retry concorrente com T2_DUPLICATE_IN_FLIGHT'
);

-- ----------------------------------------------------------------------------
-- 5) Telefone inválido -> T2_INVALID_PHONE
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT ingest_lead_prospeccao(%L::uuid, %s)',
    '00000000-0000-0000-0000-000000000004',
    '''{"external_event_id":"lead:cccccccc-0000-0000-0000-000000000003:demo:0","correlation_id":"cccccccc-0000-0000-0000-000000000003","ciclo":0,"origem":"prospeccao-aaagencia","lead":{"nome":"Lead Sem Fone","telefone":"123"},"demo":{},"mensagem_whatsapp":"oi"}''::jsonb'
  ),
  'T2_INVALID_PHONE',
  'telefone não normalizável rejeita com T2_INVALID_PHONE'
);

SELECT * FROM finish();
ROLLBACK;
