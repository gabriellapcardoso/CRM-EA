import { generateText } from 'ai';
import { Resend } from 'resend';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';
import { getModel } from '@/lib/ai/config';

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

const ALERT_TYPE = 'ai_health_degraded';

/** Resultado da checagem sintética de uma organização. */
type CheckResult = { ok: true } | { ok: false; motivo: string };

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
  supabase: ReturnType<typeof createStaticAdminClient>,
  organizationId: string,
): Promise<CheckResult> {
  try {
    const config = await getOrgAIConfig(supabase as never, organizationId);
    if (!config) return { ok: false, motivo: 'getOrgAIConfig devolveu null (sem settings ou sem chave)' };

    const model = getModel(config.provider, config.apiKey, config.model);

    // 64 tokens, não 5. Com 5 o DeepSeek v4 consumia o orçamento inteiro no
    // raciocínio interno e devolvia texto vazio — o check acusava "IA fora do
    // ar" com a IA perfeitamente saudável. Falso positivo em monitor é pior que
    // monitor nenhum: ensina a ignorar o alerta. Pego no teste ao vivo.
    const result = await generateText({
      model,
      prompt: 'Responda apenas: ok',
      maxOutputTokens: 64,
      abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });

    // Texto vazio COM tokens gerados é modelo de raciocínio gastando o orçamento
    // internamente, não serviço fora do ar — a via funcionou. Só conta como
    // falha quando nada foi gerado, aí sim não houve resposta nenhuma.
    // O TEOR nunca é checado: o modelo pode responder o que quiser desde que
    // responda, senão variação normal de modelo viraria alerta falso.
    const semTexto = !result.text || result.text.trim() === '';
    const semTokens = (result.usage?.totalTokens ?? 0) === 0;
    if (semTexto && semTokens) {
      return { ok: false, motivo: 'modelo não gerou nem texto nem tokens' };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, motivo: msg.slice(0, 500) };
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
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createStaticAdminClient();

  // Só orgs que ligaram a IA e têm chave. Org sem isso não é falha — é ausência
  // de configuração, e alertar sobre ela seria ruído puro.
  const { data: orgs, error: orgsError } = await supabase
    .from('organization_settings')
    .select('organization_id, alert_email')
    .eq('ai_enabled', true)
    .not('ai_openrouter_key', 'is', null);

  if (orgsError) {
    console.error('[Cron:ai-health] Failed to fetch org settings:', orgsError);
    return json({ error: 'Failed to fetch org settings' }, 500);
  }

  let checked = 0;
  let degraded = 0;
  let alerted = 0;

  await Promise.allSettled(
    (orgs ?? []).map(async (org) => {
      checked++;
      const resultado = await checarIA(supabase, org.organization_id);
      if (resultado.ok) return; // sucesso não grava nada: 96 execuções saudáveis = 0 linhas

      degraded++;
      const agora = new Date();

      // Já houve falha na janela? Então esta é a 2ª consecutiva.
      const janelaDesde = new Date(agora.getTime() - CONSECUTIVE_WINDOW_MS).toISOString();
      const { data: falhaAnterior } = await supabase
        .from('security_alerts')
        .select('id')
        .eq('organization_id', org.organization_id)
        .eq('alert_type', ALERT_TYPE)
        .gte('created_at', janelaDesde)
        .limit(1)
        .maybeSingle();

      const segundaFalha = Boolean(falhaAnterior);
      const severity = segundaFalha ? 'critical' : 'info';
      const title = segundaFalha
        ? 'IA fora do ar (2 falhas seguidas)'
        : 'IA falhou uma checagem';
      const description = segundaFalha
        ? `Duas checagens seguidas falharam. O agente de WhatsApp, a análise de deal e o cron de estágios estão sem IA. Último erro: ${resultado.motivo}`
        : `Uma checagem falhou. Ainda não é alerta — se a próxima também falhar, o e-mail sai. Erro: ${resultado.motivo}`;

      // Cooldown consultado ANTES do insert, senão o próprio registro que
      // estamos gravando apareceria como "e-mail recente" e silenciaria o
      // primeiro alerta — o único que importa.
      const cooldownDesde = new Date(
        agora.getTime() - EMAIL_COOLDOWN_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const { data: emailRecente } = segundaFalha
        ? await supabase
            .from('security_alerts')
            .select('id')
            .eq('organization_id', org.organization_id)
            .eq('alert_type', ALERT_TYPE)
            .eq('severity', 'critical')
            .gte('created_at', cooldownDesde)
            .limit(1)
            .maybeSingle()
        : { data: null };

      // Grava SEMPRE (auditoria). Só o e-mail é limitado pelo cooldown.
      await supabase.from('security_alerts').insert({
        organization_id: org.organization_id,
        alert_type: ALERT_TYPE,
        severity,
        title,
        description,
        details: {
          motivo: resultado.motivo,
          segunda_falha: segundaFalha,
          checked_at: agora.toISOString(),
        },
      });

      if (!segundaFalha) return; // 1ª falha é observação, não alerta: nada de e-mail
      if (emailRecente) return; // já avisou nas últimas 4h, não repete

      if (!org.alert_email) {
        // Não é detalhe: o alerta de canal WhatsApp ficou 30 dias gravando em
        // tabela e não avisando ninguém exatamente por isto. Loga alto.
        console.error(
          `[Cron:ai-health] IA FORA DO AR na org ${org.organization_id} e alert_email está VAZIO — ninguém será avisado. Preencha organization_settings.alert_email.`,
        );
        return;
      }

      if (!process.env.RESEND_API_KEY) {
        console.error('[Cron:ai-health] IA fora do ar mas RESEND_API_KEY não está configurada — e-mail não enviado.');
        return;
      }

      alerted++;
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.ALERT_EMAIL_FROM ?? 'alertas@aaagencia.com.br',
          to: org.alert_email,
          subject: `[CRM] ${title}`,
          text: `${description}\n\nO que está parado: agente de WhatsApp, análise de deal, briefing, script de vendas e o cron de avaliação de estágios.\n\nOnde olhar: Configurações → IA (modelo e chave da OpenRouter). Se o modelo tiver saído do catálogo, troque por um id datado.`,
        });
      } catch (err) {
        console.error('[Cron:ai-health] Failed to send alert email:', err);
      }
    }),
  );

  console.log(`[Cron:ai-health] Done — checked: ${checked}, degraded: ${degraded}, alerted: ${alerted}`);
  return json({ checked, degraded, alerted });
}
