-- Heartbeat + watchdog dos crons de health check (issue #20, P0).
--
-- Problema que isto resolve: o `ai-health` só gravava quando havia FALHA, e o
-- `net.http_get` que o dispara descarta a resposta. Consequência: cron
-- desagendado, 401 por rotação de CRON_SECRET, ou aplicação fora do ar
-- produziam exatamente o mesmo estado observável que "IA saudável" — zero
-- linhas em security_alerts, zero e-mails. Um monitor cuja morte é
-- indistinguível de sucesso não é monitor.
--
-- O watchdog roda DENTRO do banco (pg_cron + SQL puro, sem HTTP), então
-- sobrevive à Vercel inteira cair — que é justamente o cenário em que o
-- health check para de reportar.

create table if not exists public.cron_heartbeats (
  job_name text primary key,
  last_run_at timestamptz not null default now(),
  last_status text not null default 'ok',
  details jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.cron_heartbeats is
  'Última execução de cada cron. Alimentado pelas próprias rotas; vigiado por check_cron_heartbeats(). Ver issue #20.';

alter table public.cron_heartbeats enable row level security;

-- Só o service role escreve (as rotas de cron). Leitura para authenticated,
-- para uma futura tela de status.
drop policy if exists "cron_heartbeats_select" on public.cron_heartbeats;
create policy "cron_heartbeats_select" on public.cron_heartbeats
  for select to authenticated using (true);

-- Índice que as consultas de janela/cooldown do ai-health usam. Sem ele são
-- dois seq scans por org por execução, numa tabela que só cresce.
create index if not exists security_alerts_org_type_created_idx
  on public.security_alerts (organization_id, alert_type, created_at desc);

/**
 * Alerta quando um heartbeat envelhece mais que o tolerado.
 *
 * Grava em security_alerts com `organization_id = null` (é alerta de
 * instância, não de organização). Não manda e-mail: SQL não tem como, e
 * depender da aplicação pra avisar que a aplicação morreu seria circular.
 * A entrega externa depende de um dead-man's switch de terceiro — registrado
 * como pendência em TODOS.md.
 */
create or replace function public.check_cron_heartbeats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j record;
  -- 40min = 2 ciclos de 15min + folga. Menos que isso gera alarme falso em
  -- atraso normal de agendamento.
  tolerancia interval := interval '40 minutes';
begin
  for j in
    select job_name, last_run_at from public.cron_heartbeats
    where last_run_at < now() - tolerancia
  loop
    -- Um alerta por job por janela de tolerância, senão vira spam a cada minuto.
    if exists (
      select 1 from public.security_alerts
      where alert_type = 'cron_heartbeat_stale'
        and details->>'job_name' = j.job_name
        and created_at > now() - tolerancia
    ) then
      continue;
    end if;

    insert into public.security_alerts (organization_id, alert_type, severity, title, description, details)
    values (
      null,
      'cron_heartbeat_stale',
      'critical',
      format('Cron "%s" parou de reportar', j.job_name),
      format(
        'Último sinal em %s. O monitor não está rodando — a IA pode estar fora do ar sem ninguém saber. Verifique: o job existe em cron.job, o CRON_SECRET do pg_cron bate com o da Vercel, e a aplicação responde.',
        j.last_run_at
      ),
      jsonb_build_object('job_name', j.job_name, 'last_run_at', j.last_run_at, 'checked_at', now())
    );
  end loop;
end $$;

-- Watchdog a cada 10min. Guardado como as outras migrations de pg_cron: o
-- Postgres local do `supabase start` não traz o schema cron.
DO $$
BEGIN
  PERFORM cron.schedule(
    'cron-heartbeat-watchdog',
    '*/10 * * * *',
    $cron$ select public.check_cron_heartbeats(); $cron$
  );
  RAISE NOTICE 'Created cron job: cron-heartbeat-watchdog (a cada 10 min)';
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron indisponível. Agende cron-heartbeat-watchdog manualmente em produção.';
END $$;
