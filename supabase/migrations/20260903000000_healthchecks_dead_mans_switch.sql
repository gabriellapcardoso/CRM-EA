-- Dead-man's switch externo pro watchdog de cron (issue #23, item 1).
--
-- Problema que isto fecha: check_cron_heartbeats() (migration anterior) já
-- DETECTA cron parado e GRAVA em security_alerts — mas SQL não manda e-mail,
-- e depender da própria aplicação pra avisar que ela caiu é circular. Na
-- prática: se o cron parar, existe um registro dizendo isso e ninguém é
-- notificado. Era a única parte do P0 da issue #20 que ficou pela metade.
--
-- Um dead-man's switch inverte o modelo: em vez de alguém checar se estamos
-- de pé, SOMOS NÓS que avisamos que estamos vivos — a cada execução do
-- watchdog em que NADA está atrasado. Se o Supabase inteiro cair, ou o
-- pg_cron for desativado, o ping simplesmente para de chegar, e o
-- healthchecks.io (serviço externo, roda fora da nossa infra) alerta por
-- fora, sem depender de nada nosso pra funcionar. Se só ai-health ou
-- evolution-health pararem, o watchdog já detecta isso hoje (não pinga,
-- porque não está tudo são) — o alerta desse caso segue saindo por
-- security_alerts/e-mail, como já funciona.
--
-- __HEALTHCHECKS_PING_URL__ abaixo é placeholder — substituído na hora de
-- aplicar em produção pela Ping URL real do check em healthchecks.io. Não é
-- credencial de autenticação (não dá acesso a nada além de marcar aquele
-- check específico como "vivo"), mas o repositório é público — nunca
-- commitar o valor real, só pra não virar alvo de ping de terceiros.
--
-- A guarda abaixo NÃO pode comparar o placeholder contra uma cópia dele
-- mesmo (ex.: `position('__X__' in $g$__X__$g$)`): a substituição por texto
-- (sed/find-replace) troca AMBOS os lados igualmente, e "valor == valor" dá
-- verdadeiro sempre — a guarda dispararia mesmo com o valor certo já no
-- lugar. Foi exatamente isso que aconteceu aqui (ver DESAFIOS.md). O canário
-- abaixo é escrito quebrado — concatenado em runtime — de propósito: sed não
-- enxerga "__HEALTHCHECKS" || "_PING_URL__" como o texto contíguo do
-- placeholder, então nunca é tocado pela substituição e continua valendo o
-- placeholder de verdade depois que o resto do arquivo já foi trocado.
DO $$
DECLARE
  valor_no_arquivo TEXT := '__HEALTHCHECKS_PING_URL__';
  canario_do_placeholder TEXT := '__HEALTHCHECKS' || '_PING_URL__';
BEGIN
  IF valor_no_arquivo = canario_do_placeholder THEN
    RAISE EXCEPTION 'HEALTHCHECKS_PING_URL não substituído. Ver TODOS.md / issue #23, item 1.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_cron_heartbeats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j RECORD;
  -- 40min = 2 ciclos de 15min + folga. Menos que isso gera alarme falso em
  -- atraso normal de agendamento.
  tolerancia INTERVAL := INTERVAL '40 minutes';
  algum_atrasado BOOLEAN := false;
BEGIN
  FOR j IN
    SELECT job_name, last_run_at FROM public.cron_heartbeats
    WHERE last_run_at < now() - tolerancia
  LOOP
    algum_atrasado := true;

    -- Um alerta por job por janela de tolerância, senão vira spam a cada minuto.
    IF EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE alert_type = 'cron_heartbeat_stale'
        AND details->>'job_name' = j.job_name
        AND created_at > now() - tolerancia
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.security_alerts (organization_id, alert_type, severity, title, description, details)
    VALUES (
      NULL,
      'cron_heartbeat_stale',
      'critical',
      format('Cron "%s" parou de reportar', j.job_name),
      format(
        'Último sinal em %s. O monitor não está rodando — a IA pode estar fora do ar sem ninguém saber. Verifique: o job existe em cron.job, o CRON_SECRET do pg_cron bate com o da Vercel, e a aplicação responde.',
        j.last_run_at
      ),
      jsonb_build_object('job_name', j.job_name, 'last_run_at', j.last_run_at, 'checked_at', now())
    );
  END LOOP;

  -- Só pinga quando NADA está atrasado — o ping em si É o sinal "watchdog
  -- rodou e está tudo bem". Pingar sempre, mesmo com algo atrasado,
  -- esconderia o incidente do healthchecks.io — exatamente o serviço que
  -- existe pra cobrir o caso em que security_alerts/e-mail falhar também.
  IF NOT algum_atrasado THEN
    PERFORM net.http_get(url := 'https://hc-ping.com/__HEALTHCHECKS_PING_URL__');
  END IF;
END $$;

COMMENT ON FUNCTION public.check_cron_heartbeats() IS
  'Alerta quando um heartbeat de cron envelhece mais que o tolerado, e pinga o dead-man''s switch externo (healthchecks.io) quando está tudo saudável. Ver issue #23.';
