-- ============================================================================
-- T4 — Canal WhatsApp: lista de supressão (LGPD) + kill switch
-- (PLANO-NOVO-FLUXO.md / T4-EXECUCAO.md, /plan-eng-review 2026-07-23)
--
-- Enforcement dos dois vive em ChannelRouterService.sendMessage() (choke point
-- único de envio, confirmado na review) — esta migration só cria o schema.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('opt_out', 'manual', 'bounce')),
  source TEXT NOT NULL, -- 'inbound_keyword' | 'operator' | 'system'
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_suppression_org_phone
  ON public.whatsapp_suppression_list(organization_id, phone_e164);

ALTER TABLE public.whatsapp_suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_suppression_list FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_suppression_list_org_isolation ON public.whatsapp_suppression_list;
CREATE POLICY whatsapp_suppression_list_org_isolation ON public.whatsapp_suppression_list
  FOR ALL
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Kill switch manual de emergência — desliga TODO envio de WhatsApp da org
-- (sem teto diário automático: decisão explícita da fundadora, ver PLANO-NOVO-FLUXO.md)
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS whatsapp_kill_switch_active BOOLEAN NOT NULL DEFAULT false;

-- E-mail de alerta operacional (health-check da sessão Evolution, T4-EXECUCAO.md item 4)
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS alert_email TEXT;
