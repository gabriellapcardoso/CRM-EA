-- Health checks de IA e do canal WhatsApp precisam rodar a cada 15 minutos.
-- O plano Vercel deste projeto é Hobby, que permite no máximo 2 cron jobs e
-- só cadência diária — então os dois rodam via pg_cron + pg_net, chamando as
-- mesmas rotas por HTTP com o mesmo CRON_SECRET que elas já esperam. Mesmo
-- padrão de 20260715173000_pg_cron_stage_evaluations.sql.
--
-- Contexto (issue #16): em 2026-09-01 a OpenRouter removeu do catálogo o modelo
-- que o CRM usava e TODA a camada de IA caiu junto — 17 arquivos, incluindo o
-- agente que negocia no WhatsApp. Ninguém foi avisado; o problema foi achado por
-- acaso, olhando o console do navegador. O `ai-health` existe pra isso.
--
-- O `evolution-health` sai do vercel.json e vem pra cá junto: ele estava
-- agendado `0 9 * * *` (1x/dia) enquanto o comentário do próprio arquivo dizia
-- "a cada 30min". Um canal caindo às 10h ficava ~23h sem alerta.
--
-- __CRON_SECRET__ abaixo é placeholder, não o valor real: substituído na hora de
-- aplicar em produção (mesmo valor da env var CRON_SECRET da Vercel). Nunca
-- commitar o segredo real neste arquivo.
-- Pra rotacionar, rode `select cron.unschedule('<nome>');` e reagende.

-- Guardado como as outras migrations de pg_cron: o Postgres local do
-- `supabase start` não traz o schema cron, então pula sem falhar em vez de
-- quebrar o ambiente de desenvolvimento.
DO $$
BEGIN
  -- Falha ALTO se o placeholder não foi substituído. Sem isto, um
  -- `supabase db push` ou `db reset` reagenda os jobs com token literal
  -- inválido (cron.schedule com nome existente SUBSTITUI), e eles passam a
  -- responder 401 a cada 15 min, para sempre, sem sinal nenhum — o modo de
  -- falha silenciosa que esta migration existe para eliminar. Issue #20.
  IF position('__CRON_SECRET__' in $cron_guard$__CRON_SECRET__$cron_guard$) > 0 THEN
    RAISE EXCEPTION 'CRON_SECRET não substituído. Esta migration não pode ser aplicada pelo fluxo normal: substitua __CRON_SECRET__ pelo valor real (o mesmo da env var da Vercel) antes de executar. Ver TODOS.md.';
  END IF;

  PERFORM cron.schedule(
    'ai-health-check',
    '*/15 * * * *',
    $cron$
    select net.http_get(
      url := 'https://crm.aaagencia.com.br/api/cron/ai-health',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || '__CRON_SECRET__'
      )
    );
    $cron$
  );
  RAISE NOTICE 'Created cron job: ai-health-check (a cada 15 min)';
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron indisponível. Agende ai-health-check manualmente em produção.';
END $$;

DO $$
BEGIN
  -- Falha ALTO se o placeholder não foi substituído. Sem isto, um
  -- `supabase db push` ou `db reset` reagenda os jobs com token literal
  -- inválido (cron.schedule com nome existente SUBSTITUI), e eles passam a
  -- responder 401 a cada 15 min, para sempre, sem sinal nenhum — o modo de
  -- falha silenciosa que esta migration existe para eliminar. Issue #20.
  IF position('__CRON_SECRET__' in $cron_guard$__CRON_SECRET__$cron_guard$) > 0 THEN
    RAISE EXCEPTION 'CRON_SECRET não substituído. Esta migration não pode ser aplicada pelo fluxo normal: substitua __CRON_SECRET__ pelo valor real (o mesmo da env var da Vercel) antes de executar. Ver TODOS.md.';
  END IF;

  PERFORM cron.schedule(
    'evolution-health-check',
    '*/15 * * * *',
    $cron$
    select net.http_get(
      url := 'https://crm.aaagencia.com.br/api/cron/evolution-health',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || '__CRON_SECRET__'
      )
    );
    $cron$
  );
  RAISE NOTICE 'Created cron job: evolution-health-check (a cada 15 min)';
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron indisponível. Agende evolution-health-check manualmente em produção.';
END $$;
