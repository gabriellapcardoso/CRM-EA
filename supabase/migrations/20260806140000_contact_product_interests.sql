-- Cria contact_product_interests: liga contatos (leads manuais) ao catálogo de
-- produtos antes deles virarem deal. Espelha o padrão snapshot de deal_items
-- (name/price copiados na conversão) e o padrão RLS org-scoped de products.

CREATE TABLE IF NOT EXISTS public.contact_product_interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    observacao TEXT,
    converted_at TIMESTAMPTZ,
    converted_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- Um contato só pode ter 1 interesse pendente por produto por vez; permite
-- reaparecer (novo interesse) depois que o anterior for convertido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_product_interests_pending
ON public.contact_product_interests(contact_id, product_id)
WHERE converted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contact_product_interests_contact
ON public.contact_product_interests(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_product_interests_org
ON public.contact_product_interests(organization_id);

-- Índices de cobertura para as demais FKs (evita seq scan em merge/lookup
-- por product_id ou converted_deal_id — achado do advisor de performance).
CREATE INDEX IF NOT EXISTS idx_contact_product_interests_product
ON public.contact_product_interests(product_id);

CREATE INDEX IF NOT EXISTS idx_contact_product_interests_converted_deal
ON public.contact_product_interests(converted_deal_id);

ALTER TABLE public.contact_product_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_product_interests_org_isolate" ON public.contact_product_interests
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- Validação cross-tenant: RLS garante que a LINHA pertence à org do usuário,
-- mas não impede um usuário autenticado de criar uma linha da própria org
-- apontando contact_id/product_id/converted_deal_id de OUTRA org (FK simples
-- não valida isso). Trigger garante que os 3 relacionamentos concordam com
-- organization_id da própria linha.
CREATE OR REPLACE FUNCTION public.check_contact_product_interest_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM contacts
    WHERE id = NEW.contact_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'contact_id não pertence à organização informada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products
    WHERE id = NEW.product_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'product_id não pertence à organização informada';
  END IF;

  IF NEW.converted_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM deals
    WHERE id = NEW.converted_deal_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'converted_deal_id não pertence à organização informada';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_contact_product_interest_tenant ON public.contact_product_interests;
CREATE TRIGGER trg_check_contact_product_interest_tenant
  BEFORE INSERT OR UPDATE ON public.contact_product_interests
  FOR EACH ROW
  EXECUTE FUNCTION public.check_contact_product_interest_tenant();
