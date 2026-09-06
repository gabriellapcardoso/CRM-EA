-- Migration: modulo_clientes_revoke_trigger_funcs
--
-- As duas funções de checagem do Módulo Clientes são SECURITY DEFINER, e o
-- PostgREST expõe toda função assim como endpoint RPC. Chamá-las fora de um
-- trigger não faz nada — o Postgres recusa com "trigger functions can only be
-- called as triggers" — mas endpoint que não deveria existir é superfície que
-- não precisa existir. O advisor de segurança do Supabase flagra as duas.
--
-- Mesmo tratamento que get_user_org_id recebeu em 20260224000000. O EXECUTE
-- fica só com o dono: quem chama é o trigger, e trigger não passa pela
-- permissão do chamador.
--
-- `check_contact_product_interest_tenant` (20260806140000) tem exatamente a
-- mesma forma e continua aberta — pré-existente, registrada no TODOS.md.

REVOKE ALL ON FUNCTION public.check_client_company_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_client_team_tenant() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.check_client_company_tenant() IS
  'Trigger BEFORE INSERT/UPDATE: garante que company_id, owner_id, created_by, '
  'actor_id e signed_asset_id pertencem à mesma organização da linha. EXECUTE '
  'revogado de anon/authenticated — só o trigger chama.';

COMMENT ON FUNCTION public.check_client_team_tenant() IS
  'Trigger BEFORE INSERT/UPDATE: garante que company_id e profile_id pertencem '
  'à mesma organização da linha. EXECUTE revogado de anon/authenticated.';
