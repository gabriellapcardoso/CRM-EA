-- ============================================================
-- Drift fix: applies the indexes from 20260224000000 that never
-- actually landed in production. That migration errored on an
-- invalid `ai_decisions.organization_id` reference (column does
-- not exist — ai_decisions is isolated by user_id, not org),
-- which aborted the whole transaction; only its Section 4
-- (get_user_org_id()) was later applied out-of-band, without
-- ever being recorded in schema_migrations.
--
-- get_user_org_id() itself is intentionally NOT touched here —
-- production's current definition (JWT-claim fast path, added by
-- custom_access_token_hook) is newer than what 20260224000000
-- would create and must not be downgraded.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_activities_organization_id
  ON public.activities(organization_id);

CREATE INDEX IF NOT EXISTS idx_contacts_organization_id
  ON public.contacts(organization_id);

CREATE INDEX IF NOT EXISTS idx_deals_organization_id
  ON public.deals(organization_id);

CREATE INDEX IF NOT EXISTS idx_leads_organization_id
  ON public.leads(organization_id);

-- messaging_webhook_events has no organization_id column (scoped via
-- channel_id) — the other bad reference in 20260224000000, skipped here too.

CREATE INDEX IF NOT EXISTS idx_contacts_org_stage
  ON public.contacts(organization_id, stage);

CREATE INDEX IF NOT EXISTS idx_contacts_org_status
  ON public.contacts(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_deals_org_board
  ON public.deals(organization_id, board_id);

CREATE INDEX IF NOT EXISTS idx_activities_org_date
  ON public.activities(organization_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_messaging_conversations_status_last_msg
  ON public.messaging_conversations(status, last_message_at DESC);
