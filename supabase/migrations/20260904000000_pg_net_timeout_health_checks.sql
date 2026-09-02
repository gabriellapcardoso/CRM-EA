-- pg_net dava timeout em 5s (padrão) chamando rotas que podem levar até 20s
-- só na checagem interna de IA, mais o resto do trabalho da rota (banco,
-- e-mail, heartbeat) — dentro do `maxDuration=60` da Vercel. Issue #23, item 5.
--
-- Isto não quebrava nada até agora: `net.http_get` é fire-and-forget do lado
-- do pg_cron (a migration original nem lê a resposta), e a rota HTTP na
-- Vercel continua rodando até completar ou até o `maxDuration` estourar,
-- mesmo que o pg_net já tenha desistido de esperar. Era sorte de latência,
-- não garantia: se o pg_net chegasse a registrar o timeout como erro em
-- `net._http_response`, ou se uma versão futura do pg_cron passasse a
-- depender da resposta, o job pareceria falhar mesmo com a rota tendo
-- terminado direito.
--
-- Reagenda os dois jobs com `timeout_milliseconds := 45000` — folga real
-- acima do timeout interno de 20s da checagem de IA (`CHECK_TIMEOUT_MS` em
-- app/api/cron/ai-health/route.ts) e ainda abaixo do `maxDuration=60`.
--
-- __CRON_SECRET__ abaixo é placeholder — substituído na hora de aplicar em
-- produção. A guarda usa canário quebrado (concatenado em runtime), não uma
-- cópia do placeholder dentro de dollar-quote: essa segunda forma compara o
-- valor contra ele mesmo, e depois de substituído os dois lados continuam
-- iguais — a guarda dispara sempre, substituído ou não. Foi exatamente o bug
-- da migration anterior do dead-man's switch (ver DESAFIOS.md, 2026-09-01).
DO $$
DECLARE
  valor_no_arquivo TEXT := '__CRON_SECRET__';
  canario_do_placeholder TEXT := '__CRON' || '_SECRET__';
BEGIN
  IF valor_no_arquivo = canario_do_placeholder THEN
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
      ),
      timeout_milliseconds := 45000
    );
    $cron$
  );
  RAISE NOTICE 'Updated cron job: ai-health-check (timeout_milliseconds=45000)';
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron indisponível. Reagende ai-health-check manualmente em produção.';
END $$;

DO $$
DECLARE
  valor_no_arquivo TEXT := '__CRON_SECRET__';
  canario_do_placeholder TEXT := '__CRON' || '_SECRET__';
BEGIN
  IF valor_no_arquivo = canario_do_placeholder THEN
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
      ),
      timeout_milliseconds := 45000
    );
    $cron$
  );
  RAISE NOTICE 'Updated cron job: evolution-health-check (timeout_milliseconds=45000)';
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron indisponível. Reagende evolution-health-check manualmente em produção.';
END $$;
