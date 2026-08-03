/**
 * T3 (emissor) — Dispatcher de deal_stage_events → Gerador de Propostas Comerciais.
 *
 * Invocado por pg_cron a cada 2 minutos (ver migration
 * 20260802121000_t3_deal_stage_dispatcher_cron.sql). Lê a outbox
 * `deal_stage_events` (status pendente, ou falhou com attempt_count abaixo
 * do teto), faz POST pro Gerador de Propostas com timeout de 5s
 * (AbortSignal.timeout — mesmo padrão do emissor T2 em
 * prospeccao-aaagencia/lib/crm-export-servidor.ts), e grava o resultado.
 *
 * Nunca lança: cada evento é tratado isoladamente (um evento com erro não
 * derruba o lote inteiro), e a function sempre responde 200 com um resumo —
 * quem monitora falha é o próprio dado em deal_stage_events.status, não o
 * HTTP status desta function.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { decidirResultado, elegivelParaEnvio, montarCorpoRequisicao, resolverDestino, type DealStageEventPayload } from "./dispatcher-logic.ts";

const LOTE_MAX = 50;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface DealStageEventRow {
  id: string;
  status: "pendente" | "enviado" | "falhou";
  attempt_count: number;
  stage_slug: string;
  payload: DealStageEventPayload;
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const env = {
    PROPOSTAS_INGEST_URL: Deno.env.get("PROPOSTAS_INGEST_URL") ?? undefined,
    PROPOSTAS_INGEST_SECRET: Deno.env.get("PROPOSTAS_INGEST_SECRET") ?? undefined,
    PROSPECCAO_REAQUECER_URL: Deno.env.get("PROSPECCAO_REAQUECER_URL") ?? undefined,
    PROSPECCAO_REAQUECER_SECRET: Deno.env.get("PROSPECCAO_REAQUECER_SECRET") ?? undefined,
  };

  if (!supabaseUrl || !serviceKey) return json(500, { error: "Supabase não configurado no runtime" });

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: candidatos, error: erroLeitura } = await supabase
    .from("deal_stage_events")
    .select("id, status, attempt_count, stage_slug, payload")
    .in("status", ["pendente", "falhou"])
    .order("created_at", { ascending: true })
    .limit(LOTE_MAX * 2); // busca uma folga porque filtra elegibilidade em memória (attempt_count por status)

  if (erroLeitura) {
    console.error("deal-stage-dispatcher: falha ao ler outbox", erroLeitura.message);
    return json(200, { ok: false, error: "Falha ao ler outbox" });
  }

  const elegiveis = ((candidatos ?? []) as DealStageEventRow[])
    .filter((row) => elegivelParaEnvio(row.status, row.attempt_count))
    .slice(0, LOTE_MAX);

  let enviados = 0;
  let falhas = 0;
  let semDestino = 0;

  for (const row of elegiveis) {
    // Roteamento por stage_slug (T3c): "perdido" vai pra prospecção,
    // resto (topou-proposta e o que vier depois) vai pro Gerador de
    // Propostas — ver resolverDestino em dispatcher-logic.ts.
    const destino = resolverDestino(row.stage_slug, env);
    if (!destino.url || !destino.secret) {
      // Configuração pendente só desse destino — não falha o evento (não
      // gasta attempt_count), só deixa pendente pra próxima rodada do cron
      // depois que as envs forem configuradas.
      semDestino++;
      continue;
    }

    const corpo = montarCorpoRequisicao(row.payload);
    let httpStatus: number | null = null;
    let erroMsg: string | null = null;

    try {
      const resposta = await fetch(destino.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Webhook-Secret": destino.secret },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(5000),
      });
      httpStatus = resposta.status;
      if (!resposta.ok && httpStatus !== 409) {
        erroMsg = await resposta.text().catch(() => `HTTP ${httpStatus}`);
      }
    } catch (e) {
      erroMsg = e instanceof Error ? e.message : String(e);
    }

    const resultado = decidirResultado(httpStatus, row.attempt_count);

    // Proteção contra rebaixar sucesso: se por qualquer corrida esse evento
    // já foi marcado 'enviado' por outra tentativa/rodada entre a leitura e
    // aqui, o `.neq('status', 'enviado')` faz este UPDATE não afetar nenhuma
    // linha — nunca sobrescreve um sucesso já registrado com uma resposta
    // atrasada de tentativa anterior.
    const { error: erroUpdate } = await supabase
      .from("deal_stage_events")
      .update({
        status: resultado.novoStatus,
        attempt_count: resultado.attemptCount,
        response_status: httpStatus,
        erro: resultado.novoStatus === "enviado" ? null : (erroMsg ?? `HTTP ${httpStatus ?? "sem resposta"}`),
        sent_at: resultado.novoStatus === "enviado" ? new Date().toISOString() : undefined,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .neq("status", "enviado");

    if (erroUpdate) {
      console.error(
        "deal-stage-dispatcher: falha ao gravar resultado",
        JSON.stringify({ event_id: row.id, code: erroUpdate.code }),
      );
      continue;
    }

    if (resultado.novoStatus === "enviado") enviados++;
    else falhas++;
  }

  return json(200, { ok: true, processado: elegiveis.length, enviados, falhas, semDestino });
});
