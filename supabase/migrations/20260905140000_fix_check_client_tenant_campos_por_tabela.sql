-- Migration: fix_check_client_tenant_campos_por_tabela
--
-- Achado por sonda transacional em produção, minutos depois de aplicar
-- 20260905120000. A migration tinha rodado sem erro, todos os objetos estavam
-- no lugar e o advisor de segurança estava limpo — e TODO insert de contrato
-- falhava:
--
--   ERROR: 42703: record "new" has no field "created_by"
--
-- check_client_company_tenant() é compartilhada por client_contracts,
-- client_context, client_rag_store, client_assets e client_events. As checagens
-- opcionais estavam escritas assim:
--
--   IF TG_TABLE_NAME = 'client_assets' AND NEW.created_by IS NOT NULL ...
--
-- O `TG_TABLE_NAME = ...` na frente PARECE proteger, e não protege: PL/pgSQL
-- compila a expressão booleana inteira como uma consulta SQL só, e
-- `NEW.created_by` não resolve quando NEW é do tipo client_contracts. Não há
-- curto-circuito em tempo de compilação.
--
-- É o mesmo defeito que a revisão do PR #77 tinha acabado de consertar
-- (organization_id sem trigger), reintroduzido pelo próprio conserto. E foi
-- invisível para as guardas: elas casam texto do arquivo, não executam a função.
--
-- A leitura passa a ser por to_jsonb(NEW): `linha ->> 'created_by'` devolve NULL
-- numa tabela que não tem a coluna, em vez de erro. Independe do formato do
-- registro. IF aninhado também funcionaria (PL/pgSQL planeja cada comando na
-- primeira execução, e ramo não tomado não é planejado), mas depende de uma
-- sutileza que não sobrevive a uma edição futura desatenta.
--
-- Verificado em produção, dentro de transação desfeita: contrato com empresa de
-- outra organização recusa; asset com created_by de outra organização recusa;
-- asset válido passa; signed_asset_id que não é contrato recusa.

CREATE OR REPLACE FUNCTION public.check_client_company_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linha JSONB := to_jsonb(NEW);
  perfil UUID;
  asset UUID;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id não foi preenchido — confira o trigger client_*_set_org_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm_companies
    WHERE id = NEW.company_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'company_id não pertence à organização informada';
  END IF;

  -- Perfis referenciados também têm que ser da mesma organização. RLS protege
  -- a LINHA; nada impede a linha da organização A apontar um perfil da B, e a
  -- FK aceita o UUID sem opinião. Os nomes de coluna variam por tabela, então
  -- a leitura é pelo jsonb.
  FOR perfil IN
    SELECT v FROM (VALUES
      ((linha ->> 'owner_id')::uuid),
      ((linha ->> 'created_by')::uuid),
      ((linha ->> 'actor_id')::uuid)
    ) AS t(v) WHERE v IS NOT NULL
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = perfil AND organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'perfil referenciado (%) não pertence à organização informada', perfil;
    END IF;
  END LOOP;

  -- O contrato assinado tem que ser um asset DA MESMA EMPRESA e do tipo
  -- contrato — senão dá pra apontar o contrato de outro cliente como se
  -- fosse deste.
  asset := (linha ->> 'signed_asset_id')::uuid;
  IF asset IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM client_assets
    WHERE id = asset
      AND company_id = NEW.company_id
      AND organization_id = NEW.organization_id
      AND kind = 'contrato'
  ) THEN
    RAISE EXCEPTION 'signed_asset_id não é um contrato desta empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_client_company_tenant() FROM PUBLIC, anon, authenticated;
