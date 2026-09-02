import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';
import { getModel } from '@/lib/ai/config';
import { autenticaCron } from '@/lib/security/cronAuth';
import { redactSecrets } from '@/lib/security/redactSecrets';
import { comLimiteDeConcorrencia } from '@/lib/utils/concurrency';

export const maxDuration = 60;

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Timeout da chamada sintética. Acima disso a IA está inutilizável na prática. */
const CHECK_TIMEOUT_MS = 20_000;

/**
 * Janela para considerar duas falhas "consecutivas". 20min e não 15 pra tolerar
 * atraso de agendamento do cron sem perder o par de falhas.
 */
const CONSECUTIVE_WINDOW_MS = 20 * 60 * 1000;

/**
 * Cooldown de e-mail. Distinto da janela acima: a janela decide se é a 2ª
 * falha, isto decide se manda e-mail. Sem ele, uma IA fora do ar durante a
 * noite renderia 90+ e-mails e o alerta real se perderia no ruído.
 */
const EMAIL_COOLDOWN_HOURS = 4;

/**
 * Máximo de orgs checadas ao mesmo tempo. Sem limite, o número de chamadas
 * simultâneas à OpenRouter e ao pool de conexão do Supabase cresce junto com
 * o número de orgs — rate limit e contenção no pool viram backoff que
 * acumula tempo, e numa rota com `maxDuration=60` o lote pode ser cortado no
 * meio sem nenhum registro do que ficou pra trás. Issue #23, item 17.
 */
const CONCORRENCIA_MAXIMA = 10;

const ALERT_TYPE = 'ai_health_degraded';

/**
 * Resultado da checagem. `degradado` distingue "a aplicação caiu" de "a
 * aplicação está de pé no modelo errado" — os dois precisam de aviso, com
 * urgências diferentes.
 */
type CheckResult =
  | { ok: true }
  | { ok: false; motivo: string; degradado?: boolean };

/**
 * Faz UMA chamada real de IA pelo mesmo caminho que a aplicação usa.
 *
 * Deliberadamente não é um ping ao endpoint da OpenRouter: passa por
 * `getOrgAIConfig` + `getModel`, então exercita chave da org, modelo
 * configurado, formato do id e o failover de modelo (PR #14). Um ping teria
 * passado no incidente de 2026-09-01, em que a configuração da org é que estava
 * quebrada — o serviço externo estava de pé.
 */
async function checarIA(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CheckResult> {
  try {
    const config = await getOrgAIConfig(supabase, organizationId);
    if (!config) return { ok: false, motivo: 'getOrgAIConfig devolveu null (sem settings ou sem chave)' };

    const model = getModel(config.provider, config.apiKey, config.model);

    // `Output.object`, não texto puro: as 17 chamadas reais da aplicação usam
    // `Output.object({ schema })` e o agente usa tools. Um modelo de reserva que
    // responde texto mas não suporta `structured_outputs` quebraria todas as
    // tasks com o check reportando verde — falso negativo exatamente durante o
    // incidente. Exercitar o caminho real é o ponto do check existir.
    //
    // 64 tokens, não 5: com 5 o DeepSeek v4 consumia o orçamento inteiro no
    // raciocínio interno e devolvia vazio, e o check acusava falha com a IA
    // saudável.
    const result = await generateText({
      model,
      prompt: 'Responda com ok: true.',
      maxOutputTokens: 64,
      output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
      abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });

    // Modelo que RESPONDEU vs modelo PEDIDO. Sem esta comparação o check é cego
    // justamente para o incidente que o motivou: em 2026-09-01 a OpenRouter
    // removeu do catálogo o modelo configurado, o failover do PR #14 resgatou a
    // chamada dentro da mesma requisição, e o check reportou
    // `{"degraded":0}` — provado em produção. O failover é anestesia: mantém a
    // aplicação de pé E esconde que a configuração da org está morta.
    const modeloRespondeu = result.response?.modelId;
    const emFallback =
      typeof modeloRespondeu === 'string' &&
      modeloRespondeu.length > 0 &&
      modeloRespondeu !== config.model;

    if (emFallback) {
      return {
        ok: false,
        degradado: true,
        motivo: `modelo configurado "${config.model}" não atendeu; a OpenRouter caiu para "${modeloRespondeu}". A aplicação segue de pé pelo failover, mas a configuração da org precisa ser corrigida.`,
      };
    }

    // Sem `output` nenhum e sem tokens = não houve resposta. Com um dos dois, a
    // via funcionou. `usage` ausente é "não sei", não zero.
    const semSaida = result.output === undefined || result.output === null;
    const usageConhecido = result.usage?.totalTokens !== undefined;
    const semTokens = usageConhecido && (result.usage?.totalTokens ?? 0) === 0;
    if (semSaida && (semTokens || !usageConhecido)) {
      return { ok: false, motivo: 'modelo não gerou saída estruturada nem tokens' };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Redigido na origem, antes de virar `motivo`: este texto vai pro banco
    // (security_alerts) e pro corpo do e-mail sem mais nenhum filtro depois
    // daqui. Provedores às vezes ecoam parte da chave recebida na própria
    // mensagem de erro pra ajudar a debugar. Issue #23, item 19.
    return { ok: false, motivo: redactSecrets(msg.slice(0, 500)) };
  }
}

/**
 * GET /api/cron/ai-health
 *
 * Health check da camada de IA. Existe porque em 2026-09-01 a OpenRouter removeu
 * do catálogo o modelo que o CRM usava e TODA a IA caiu junto — 17 arquivos,
 * incluindo o agente que negocia no WhatsApp e o cron de avaliação de estágios.
 * Ninguém foi avisado: o problema foi achado por acaso, olhando o console do
 * navegador durante um QA de layout.
 *
 * O failover de modelo (PR #14) cobre "um modelo sumiu". NÃO cobre chave
 * revogada, crédito zerado, nem os três modelos da lista falharem juntos. É
 * disso que este check trata.
 *
 * Alerta na SEGUNDA falha consecutiva: uma falha isolada pode ser soluço de
 * rede, duas seguidas é padrão. Como cada execução do cron é um processo novo,
 * o estado mora no banco (ver `security_alerts` abaixo).
 *
 * Agendado por **pg_cron**, não pelo vercel.json: o plano Vercel deste projeto
 * é Hobby, que permite no máximo 2 cron jobs e só cadência diária — um
 * `vercel.json` com 3 crons, ou com cadência menor que um dia, é rejeitado e o
 * deployment sequer chega a ser criado (foi o que travou o deploy em
 * 2026-09-01, até o vercel.json voltar a ser válido).
 * Ver `supabase/migrations/20260901180000_pg_cron_health_checks.sql`; a
 * cadência real mora lá e este comentário não a repete.
 *
 * Protegido por CRON_SECRET, mesmo padrão de evolution-health e template-sync.
 * Ver issue #16.
 */
export async function GET(req: Request) {
  if (!autenticaCron(req)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createStaticAdminClient();

  // Só orgs que ligaram a IA e têm chave. Org sem isso não é falha — é ausência
  // de configuração, e alertar sobre ela seria ruído puro.
  const { data: orgs, error: erroBusca } = await supabase
    .from('organization_settings')
    .select('organization_id, alert_email')
    .eq('ai_enabled', true)
    .not('ai_openrouter_key', 'is', null);

  if (erroBusca) {
    console.error('[Cron:ai-health] Failed to fetch org settings:', erroBusca);
    return json({ error: 'Failed to fetch org settings' }, 500);
  }

  // organization_settings não tem deleted_at próprio (é 1:1 com organizations,
  // sem soft-delete dele mesmo) — uma org excluída continua com IA ligada e
  // chave configurada, e entraria na consulta acima: gastando crédito de IA
  // paga e recebendo e-mail por uma org que não existe mais pro produto.
  const idsCandidatos = (orgs ?? []).map((o) => o.organization_id);
  let idsExcluidos = new Set<string>();
  if (idsCandidatos.length > 0) {
    const { data: excluidas, error: erroOrgs } = await supabase
      .from('organizations')
      .select('id')
      .in('id', idsCandidatos)
      .not('deleted_at', 'is', null);
    if (erroOrgs) {
      // Na dúvida, segue sem filtrar: um erro de leitura aqui não pode parar
      // de checar TODAS as orgs (inclusive as ativas) por causa de uma
      // consulta auxiliar falhando.
      console.error('[Cron:ai-health] ERRO ao checar orgs excluídas — seguindo sem filtrar (pode checar org já excluída):', erroOrgs);
    } else {
      idsExcluidos = new Set((excluidas ?? []).map((o) => o.id));
    }
  }
  const orgsElegiveis = (orgs ?? []).filter((o) => !idsExcluidos.has(o.organization_id));

  let checked = 0;
  let degraded = 0;
  let alerted = 0;
  /** Erros de banco engolidos viravam alerta que nunca escala. Agora são contados e devolvidos. */
  let errosBanco = 0;

  await comLimiteDeConcorrencia(
    orgsElegiveis.map((org) => async () => {
      checked++;
      const resultado = await checarIA(supabase, org.organization_id);
      if (resultado.ok) return; // sucesso não grava nada: 96 execuções saudáveis = 0 linhas

      degraded++;
      const agora = new Date();

      // Já houve falha na janela? Então esta é a 2ª consecutiva.
      const janelaDesde = new Date(agora.getTime() - CONSECUTIVE_WINDOW_MS).toISOString();
      const { data: falhaAnterior, error: erroJanela } = await supabase
        .from('security_alerts')
        .select('id')
        .eq('organization_id', org.organization_id)
        .eq('alert_type', ALERT_TYPE)
        .gte('created_at', janelaDesde)
        .limit(1)
        .maybeSingle();

      // Erro de leitura NÃO pode virar "primeira falha": se a consulta falhar,
      // toda execução se acharia a primeira, o alerta nunca escalaria e o e-mail
      // nunca sairia — falha silenciosa exatamente no componente que existe pra
      // acabar com falhas silenciosas.
      if (erroJanela) {
        console.error(
          `[Cron:ai-health] ERRO ao consultar a janela de falhas da org ${org.organization_id} — o alerta pode não escalar:`,
          erroJanela,
        );
        errosBanco++;
      }

      const segundaFalha = Boolean(falhaAnterior);
      const degradado = resultado.degradado === true;
      const severity = segundaFalha ? 'critical' : 'info';
      const title = degradado
        ? 'IA rodando no modelo de reserva'
        : segundaFalha
          ? 'IA fora do ar (2 falhas seguidas)'
          : 'IA falhou uma checagem';
      const description = degradado
        ? resultado.motivo
        : segundaFalha
          ? `Duas checagens seguidas falharam. O agente de WhatsApp, a análise de deal e o cron de estágios estão sem IA. Último erro: ${resultado.motivo}`
          : `Uma checagem falhou. Ainda não é alerta — se a próxima também falhar, o e-mail sai. Erro: ${resultado.motivo}`;

      // O cooldown mede E-MAIL ENVIADO, não linha gravada. A versão anterior
      // procurava `severity='critical'` e gravava um `critical` a cada execução:
      // a janela de 4h se auto-alimentava e nunca expirava, então saía UM e-mail
      // por incidente e nunca mais — inclusive para um incidente novo meia hora
      // depois. Observado em produção em 2026-09-01 (`degraded:1, alerted:0`).
      const cooldownDesde = new Date(
        agora.getTime() - EMAIL_COOLDOWN_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const { data: emailRecente, error: erroCooldown } = segundaFalha
        ? await supabase
            .from('security_alerts')
            .select('id')
            .eq('organization_id', org.organization_id)
            .eq('alert_type', ALERT_TYPE)
            .contains('details', { email_enviado: true })
            .gte('created_at', cooldownDesde)
            .limit(1)
            .maybeSingle()
        : { data: null, error: null };

      if (erroCooldown) {
        // Na dúvida, avisar: e-mail repetido incomoda, alerta perdido custa caro.
        console.error(`[Cron:ai-health] ERRO ao consultar o cooldown da org ${org.organization_id}:`, erroCooldown);
        errosBanco++;
      }

      const vaiMandarEmail =
        segundaFalha && !emailRecente && Boolean(org.alert_email) && Boolean(process.env.RESEND_API_KEY);

      let emailEnviado = false;
      if (vaiMandarEmail) {
        // `resend.emails.send` NÃO lança em erro de API: devolve `{ error }`.
        // Domínio não verificado, rate limit e destinatário inválido passavam
        // pelo try/catch e eram contados como entrega.
        try {
          const resend = new Resend(process.env.RESEND_API_KEY as string);
          const { error: erroEmail } = await resend.emails.send({
            from: process.env.ALERT_EMAIL_FROM ?? 'alertas@aaagencia.com.br',
            to: org.alert_email as string,
            subject: `[CRM] ${title}`,
            text: degradado
              ? `${description}\n\nO CRM continua funcionando — a OpenRouter está atendendo por um modelo de reserva. Corrija o modelo em Configurações → IA para voltar ao escolhido.`
              : `${description}\n\nO que está parado: agente de WhatsApp, análise de deal, briefing, script de vendas e o cron de avaliação de estágios.\n\nOnde olhar: Configurações → IA (modelo e chave da OpenRouter). Se o modelo tiver saído do catálogo, troque por um id datado.`,
          });
          if (erroEmail) {
            console.error('[Cron:ai-health] Resend recusou o envio:', erroEmail);
          } else {
            emailEnviado = true;
            alerted++;
          }
        } catch (err) {
          console.error('[Cron:ai-health] Failed to send alert email:', err);
        }
      }

      // Grava SEMPRE (auditoria), com o resultado REAL do envio — é esse campo
      // que o cooldown lê na próxima execução.
      const { error: erroInsert } = await supabase.from('security_alerts').insert({
        organization_id: org.organization_id,
        alert_type: ALERT_TYPE,
        severity,
        title,
        description,
        details: {
          motivo: resultado.motivo,
          segunda_falha: segundaFalha,
          degradado,
          email_enviado: emailEnviado,
          checked_at: agora.toISOString(),
        },
      });

      if (erroInsert) {
        // Sem o registro, a próxima execução se acha a primeira e o alerta nunca
        // escala. Precisa doer alto.
        console.error(
          `[Cron:ai-health] ERRO ao gravar o alerta da org ${org.organization_id} — a próxima execução vai se achar a primeira falha:`,
          erroInsert,
        );
        errosBanco++;
      }

      // Sem destino ou sem chave, o alerta não chega em ninguém. É o buraco de 30
      // dias do canal WhatsApp; precisa doer alto no log.
      if (segundaFalha && !emailRecente && !org.alert_email) {
        console.error(
          `[Cron:ai-health] IA FORA DO AR na org ${org.organization_id} e alert_email está VAZIO — ninguém será avisado. Preencha organization_settings.alert_email.`,
        );
      }
      if (segundaFalha && !emailRecente && org.alert_email && !process.env.RESEND_API_KEY) {
        console.error('[Cron:ai-health] IA fora do ar mas RESEND_API_KEY não está configurada — e-mail não enviado.');
      }
    }),
    CONCORRENCIA_MAXIMA,
  );

  // Heartbeat: gravado em TODA execução, inclusive quando está tudo saudável.
  // Sem ele, "cron desagendado", "401 por rotação de segredo" e "deploy fora do
  // ar" produzem exatamente o mesmo estado observável que "IA saudável" —
  // nenhuma linha, nenhum e-mail. Quem observa a idade deste heartbeat é o
  // watchdog em pg_cron, que roda DENTRO do banco e por isso sobrevive à
  // aplicação inteira cair.
  const { error: erroHeartbeat } = await supabase.from('cron_heartbeats').upsert(
    {
      job_name: 'ai-health',
      last_run_at: new Date().toISOString(),
      last_status: errosBanco > 0 ? 'degraded' : 'ok',
      details: { checked, degraded, alerted, erros_banco: errosBanco },
    },
    { onConflict: 'job_name' },
  );
  if (erroHeartbeat) {
    console.error('[Cron:ai-health] ERRO ao gravar heartbeat — o watchdog vai alertar:', erroHeartbeat);
  }

  // `checked: 0` com 200 é no-op silencioso: coluna renomeada, ai_enabled
  // desligado ou chave migrada de lugar deixariam o monitor sem nada pra checar
  // e parecendo saudável.
  if (checked === 0) {
    console.error('[Cron:ai-health] NENHUMA org foi checada — a query não casou nada. O monitor está inerte.');
  }

  console.log(
    `[Cron:ai-health] Done — checked: ${checked}, degraded: ${degraded}, alerted: ${alerted}, errosBanco: ${errosBanco}`,
  );
  return json({ checked, degraded, alerted, errosBanco });
}
