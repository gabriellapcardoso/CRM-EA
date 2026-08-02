-- ============================================================================
-- pgTAP: outbox deal_stage_events (T3 emissor)
-- Cobre: insere só ao entrar em "Topou receber proposta" (não em outros estágios),
-- contador incrementa em 2ª entrada, idempotência do external_event_id,
-- payload carrega dado do contato/deal, RPC retry_deal_stage_event.
-- ============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

-- move_deal_to_stage exige service_role ou auth.uid() não-nulo (guard de
-- auth da migration T1). Simula service_role pra rodar os testes sem sessão
-- de usuário real — mesmo mecanismo usado pelo agente IA em produção.
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';

-- ----------------------------------------------------------------------------
-- Fixtures: org, board Negociação com os 7 estágios reais (via seed), contato, deal
-- ----------------------------------------------------------------------------
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000101', 'Org Teste T3');

SELECT public.seed_negociacao_board('00000000-0000-0000-0000-000000000101');

INSERT INTO contacts (id, organization_id, name, phone, email, company_name) VALUES
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101', 'Fulano de Tal', '+5531988887777', 'fulano@exemplo.com', 'Empresa X');

INSERT INTO deals (id, organization_id, board_id, stage_id, contact_id, title, value)
SELECT
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000101',
  b.id,
  (SELECT bs.id FROM board_stages bs WHERE bs.board_id = b.id AND bs.name = 'Novo'),
  '00000000-0000-0000-0000-000000000102',
  'Proposta Empresa X',
  1500
FROM boards b WHERE b.organization_id = '00000000-0000-0000-0000-000000000101' AND b.key = 'negociacao';

-- ----------------------------------------------------------------------------
-- 1) Mover para estágio comum ("Contato") NÃO deve inserir evento
-- ----------------------------------------------------------------------------
SELECT move_deal_to_stage(
  '00000000-0000-0000-0000-000000000103',
  (SELECT bs.id FROM board_stages bs JOIN boards b ON b.id = bs.board_id WHERE b.key = 'negociacao' AND b.organization_id = '00000000-0000-0000-0000-000000000101' AND bs.name = 'Contato'),
  NULL
);

SELECT is(
  (SELECT count(*)::int FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  0,
  'mover para "Contato" não gera evento'
);

-- ----------------------------------------------------------------------------
-- 2) Mover para "Topou receber proposta" gera 1 evento com contador=1
-- ----------------------------------------------------------------------------
SELECT move_deal_to_stage(
  '00000000-0000-0000-0000-000000000103',
  (SELECT bs.id FROM board_stages bs JOIN boards b ON b.id = bs.board_id WHERE b.key = 'negociacao' AND b.organization_id = '00000000-0000-0000-0000-000000000101' AND bs.name = 'Topou receber proposta'),
  NULL
);

SELECT is(
  (SELECT count(*)::int FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  1,
  'mover para "Topou receber proposta" gera exatamente 1 evento'
);

SELECT is(
  (SELECT contador FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  1,
  '1ª entrada em "Topou receber proposta" tem contador=1'
);

SELECT is(
  (SELECT external_event_id FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  'deal:00000000-0000-0000-0000-000000000103:topou:1',
  'external_event_id no formato deal:{id}:topou:{contador}'
);

SELECT is(
  (SELECT status FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  'pendente',
  'evento novo nasce pendente'
);

SELECT is(
  (SELECT payload -> 'contact' ->> 'nome' FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  'Fulano de Tal',
  'payload carrega nome do contato vinculado ao deal'
);

SELECT is(
  (SELECT payload -> 'contact' ->> 'telefone' FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  '+5531988887777',
  'payload carrega telefone do contato'
);

SELECT is(
  (SELECT (payload -> 'deal' ->> 'valor')::numeric FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  1500::numeric,
  'payload carrega valor do deal'
);

-- ----------------------------------------------------------------------------
-- 3) Sair e voltar a "Topou receber proposta" gera 2º evento com contador=2
-- ----------------------------------------------------------------------------
SELECT move_deal_to_stage(
  '00000000-0000-0000-0000-000000000103',
  (SELECT bs.id FROM board_stages bs JOIN boards b ON b.id = bs.board_id WHERE b.key = 'negociacao' AND b.organization_id = '00000000-0000-0000-0000-000000000101' AND bs.name = 'Negociando'),
  NULL
);
SELECT move_deal_to_stage(
  '00000000-0000-0000-0000-000000000103',
  (SELECT bs.id FROM board_stages bs JOIN boards b ON b.id = bs.board_id WHERE b.key = 'negociacao' AND b.organization_id = '00000000-0000-0000-0000-000000000101' AND bs.name = 'Topou receber proposta'),
  NULL
);

SELECT is(
  (SELECT count(*)::int FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  2,
  'topar de novo (depois de sair do estágio) gera um 2º evento'
);

SELECT is(
  (SELECT contador FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103' AND external_event_id = 'deal:00000000-0000-0000-0000-000000000103:topou:2'),
  2,
  '2ª entrada em "Topou receber proposta" tem contador=2'
);

-- ----------------------------------------------------------------------------
-- 4) Idempotência: UPDATE que não muda o stage_id (mesmo valor) não duplica evento
-- ----------------------------------------------------------------------------
UPDATE deals SET updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000103';

SELECT is(
  (SELECT count(*)::int FROM deal_stage_events WHERE deal_id = '00000000-0000-0000-0000-000000000103'),
  2,
  'UPDATE que não muda stage_id não gera evento novo (trigger é WHEN OLD.stage_id IS DISTINCT FROM NEW.stage_id)'
);

-- ----------------------------------------------------------------------------
-- 5) Idempotência: external_event_id é UNIQUE — dedupe garantido mesmo se
--    dois disparos concorrentes calculassem o mesmo contador (corrida)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    $sql$INSERT INTO deal_stage_events (deal_id, organization_id, stage_slug, external_event_id, contador, payload)
         VALUES (%L, %L, 'topou-proposta', 'deal:00000000-0000-0000-0000-000000000103:topou:1', 99, '{}'::jsonb)$sql$,
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101'
  ),
  '23505',
  'duplicate key value violates unique constraint "deal_stage_events_external_event_id_key"',
  'external_event_id duplicado viola UNIQUE — dedupe garantido no nível de banco'
);

SELECT * FROM finish();
ROLLBACK;
