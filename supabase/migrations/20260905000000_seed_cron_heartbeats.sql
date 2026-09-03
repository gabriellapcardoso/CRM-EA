-- Semeia `cron_heartbeats` com os crons que DEVEM reportar.
--
-- Por que isto existe: `check_cron_heartbeats()` percorre as linhas da tabela
-- (`FROM cron_heartbeats WHERE last_run_at < now() - tolerancia`). Um cron que
-- nunca escreveu heartbeat não tem linha, não entra no laço e é invisível pro
-- watchdog PARA SEMPRE. O watchdog detecta "parou de reportar"; não detectava
-- "nunca reportou".
--
-- Isso não é hipótese. Em 2026-09-02 a migration que reagendou os health checks
-- gravou um CRON_SECRET errado nos dois jobs, e ambos passaram a responder 401 a
-- cada 15 minutos. O `ai-health` foi pego em 50 minutos, porque já tinha linha.
-- O `evolution-health` não tinha, e teria ficado morto indefinidamente — o único
-- cron sem heartbeat era justamente o único que o watchdog não conseguia notar.
--
-- Semear com `now()` transforma "nunca reportou" em "parou de reportar": se a
-- rota não escrever dentro da janela de tolerância, o laço que já existe alerta.
-- Nenhuma lógica nova no watchdog, nenhum caminho novo pra dar errado.
--
-- `on conflict do nothing` de propósito: em banco onde o cron já reporta, este
-- arquivo não pode empurrar `last_run_at` pra frente e mascarar um atraso real.

insert into public.cron_heartbeats (job_name, last_run_at, last_status, details)
values
  ('ai-health',        now(), 'seeded', jsonb_build_object('seeded_by', '20260905000000_seed_cron_heartbeats')),
  ('evolution-health', now(), 'seeded', jsonb_build_object('seeded_by', '20260905000000_seed_cron_heartbeats'))
on conflict (job_name) do nothing;

comment on table public.cron_heartbeats is
  'Última execução de cada cron. Alimentado pelas próprias rotas; vigiado por check_cron_heartbeats(). Toda rota de cron que importa precisa (1) escrever aqui a cada execução e (2) ser semeada numa migration — sem a linha, o watchdog nunca olha pra ela. Guarda: test/cronHeartbeatCoverage.test.ts. Ver issue #20 e DESAFIOS.md.';
