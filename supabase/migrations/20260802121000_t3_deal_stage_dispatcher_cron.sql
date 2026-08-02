-- =============================================================================
-- T3 (emissor) — pg_cron: drena deal_stage_events chamando a Edge Function
-- deal-stage-dispatcher a cada 2 minutos.
--
-- Mesmo padrão de 20260715173000_pg_cron_stage_evaluations.sql: guarda
-- EXCEPTION WHEN undefined_object OR invalid_schema_name pra não quebrar
-- `supabase start` local (sem extensão pg_cron). __CRM_FUNCTIONS_URL__ e
-- __CRON_SERVICE_ROLE_KEY__ são placeholders — nunca commitados com valor
-- real, substituídos manualmente via Management API em produção (mesmo
-- processo documentado em DESAFIOS.md pro cron stage-evaluations).
--
-- Por que Authorization: Bearer <service_role_key> e não X-Webhook-Secret:
-- a Edge Function roda no projeto Supabase deste próprio repo (não é um
-- receptor externo) — o gateway de functions do Supabase exige um JWT válido
-- pra invocar quando verify_jwt=true (default; deal-stage-dispatcher NÃO
-- está na lista verify_jwt=false do supabase/config.toml, ao contrário de
-- ingest-prospeccao/webhook-in, que são receptores externos autenticados por
-- secret próprio). O secret pro DESTINO (PROPOSTAS_INGEST_SECRET) é
-- diferente e fica só no ambiente da function, não aqui.
-- =============================================================================

DO $$
BEGIN
  PERFORM cron.schedule(
    'deal-stage-dispatcher-drain',
    '*/2 * * * *',
    $cron$
    select net.http_post(
      url := '__CRM_FUNCTIONS_URL__/deal-stage-dispatcher',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || '__CRON_SERVICE_ROLE_KEY__',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron extension not available (esperado em supabase start local). Job deal-stage-dispatcher-drain precisa ser registrado manualmente em produção via Management API, substituindo __CRM_FUNCTIONS_URL__ e __CRON_SERVICE_ROLE_KEY__ pelos valores reais.';
END $$;
