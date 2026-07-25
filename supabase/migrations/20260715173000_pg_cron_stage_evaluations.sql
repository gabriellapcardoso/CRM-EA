-- /api/cron/stage-evaluations needs to run every minute (drains a queue fed by
-- the messaging webhook, deferred there to dodge Vercel function-timeout risk).
-- Vercel Hobby only allows daily cron schedules, so this runs via pg_cron +
-- pg_net instead, calling the same route directly over HTTP with the same
-- CRON_SECRET the route already expects. Both extensions are already enabled
-- on this project.
--
-- __CRON_SECRET__ below is a placeholder, not committed to git with the real
-- value — it was substituted with the actual secret when this was applied
-- directly to production via the Management API (same value as the Vercel
-- CRON_SECRET env var). If re-running this by hand, substitute the real
-- value before executing; never commit the real secret to this file.
-- Rotate by re-running with a new secret after
-- `select cron.unschedule('stage-evaluations-drain');`.

-- Guarded like the other pg_cron migration (hitl_pending_alerts): local dev
-- Postgres doesn't ship the cron schema, so skip gracefully instead of
-- failing `supabase start`/pgTAP on environments without the extension.
DO $$
BEGIN
  PERFORM cron.schedule(
    'stage-evaluations-drain',
    '* * * * *',
    $cron$
    select net.http_get(
      url := 'https://crm.aaagencia.com.br/api/cron/stage-evaluations',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || '__CRON_SECRET__'
      )
    );
    $cron$
  );
  RAISE NOTICE 'Created cron job: stage-evaluations-drain (every minute)';
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron extension not available. Schedule stage-evaluations-drain manually in production.';
END $$;
