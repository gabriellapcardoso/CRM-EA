-- QA item #1 (parcial): hoje um envio rejeitado por formato incompatível
-- (400/422 do ingest-prospeccao, antes da RPC gravar em webhook_events_in)
-- não deixa nenhum rastro consultável — só aparece no log da edge function,
-- que ninguém audita rotineiramente. Esta tabela torna essas rejeições
-- visíveis para o operador, no mesmo padrão de auditoria/RLS de
-- webhook_events_in.

CREATE TABLE IF NOT EXISTS public.webhook_ingest_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.integration_inbound_sources(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'generic',
  http_status INTEGER NOT NULL,
  reason TEXT NOT NULL,
  external_event_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.webhook_ingest_rejections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS webhook_ingest_rejections_source_received_idx
  ON public.webhook_ingest_rejections(source_id, received_at DESC);

DROP POLICY IF EXISTS "Admins can view inbound webhook rejections" ON public.webhook_ingest_rejections;
CREATE POLICY "Admins can view inbound webhook rejections"
  ON public.webhook_ingest_rejections
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = webhook_ingest_rejections.organization_id
        AND role = 'admin'
    )
  );
