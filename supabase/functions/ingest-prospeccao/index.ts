/**
 * T2 — Receptor Prospecção → CRM (modo rascunho).
 *
 * Rotas:
 * - `POST /functions/v1/ingest-prospeccao/<source_id>`            → ingestão (RPC transacional)
 * - `POST /functions/v1/ingest-prospeccao/<source_id>/reconcile`  → reconciliação por correlação
 *
 * Autenticação: `X-Webhook-Secret` (ou `Bearer`) contra o `secret` da fonte em
 * `integration_inbound_sources`, comparado em tempo constante.
 *
 * Todo o trabalho de escrita acontece na RPC `ingest_lead_prospeccao` — uma
 * transação única (contato + deal + conversa + rascunho). Esta function só
 * autentica, valida o contrato e mapeia erros:
 *   T2_DUPLICATE_IN_FLIGHT → 409 · T2_INVALID_* → 422 · resto → 500 (sem detalhes)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { LIMITES, validarPayloadProspeccao } from "./contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Secret, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getSecretFromRequest(req: Request) {
  const xSecret = req.headers.get("X-Webhook-Secret") || "";
  if (xSecret.trim()) return xSecret.trim();
  const auth = req.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? "";
}

/**
 * Comparação em tempo constante (achado do hardening: `!==` vaza timing).
 * Compara digests SHA-256 dos dois valores — tamanho fixo, e um XOR por byte
 * sem short-circuit.
 */
async function secretsIguais(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

function parseRota(req: Request): { sourceId: string | null; reconcile: boolean } {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "ingest-prospeccao");
  if (idx === -1) return { sourceId: null, reconcile: false };
  return { sourceId: parts[idx + 1] ?? null, reconcile: parts[idx + 2] === "reconcile" };
}

/**
 * Registra um envio rejeitado por formato incompatível (achado do QA: hoje
 * um 422/400 não deixa rastro nenhum, então nem um operador atento consegue
 * ver que a prospecção tentou mandar algo errado). Best-effort — falha de
 * auditoria não pode impedir a resposta de erro original ao chamador.
 */
async function registrarRejeicao(
  supabase: ReturnType<typeof createClient>,
  params: {
    organizationId: string;
    sourceId: string;
    httpStatus: number;
    reason: string;
    externalEventId?: string | null;
  },
) {
  try {
    await supabase.from("webhook_ingest_rejections").insert({
      organization_id: params.organizationId,
      source_id: params.sourceId,
      provider: "prospeccao",
      http_status: params.httpStatus,
      reason: params.reason,
      external_event_id: params.externalEventId ?? null,
    });
  } catch (e) {
    console.error("ingest-prospeccao: falha ao registrar rejeição", String(e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  const { sourceId, reconcile } = parseRota(req);
  if (!sourceId) return json(404, { error: "source_id ausente na URL" });

  const secretHeader = getSecretFromRequest(req);
  if (!secretHeader) return json(401, { error: "Secret ausente" });

  const supabaseUrl = Deno.env.get("CRM_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("CRM_SUPABASE_SECRET_KEY") ??
    Deno.env.get("CRM_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { error: "Supabase não configurado no runtime" });

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: source, error: sourceErr } = await supabase
    .from("integration_inbound_sources")
    .select("id, organization_id, secret, active")
    .eq("id", sourceId)
    .maybeSingle();

  // Pré-auth: nunca vazar detalhes internos (achado do hardening)
  if (sourceErr) return json(500, { error: "Erro ao buscar fonte" });
  if (!source || !source.active) return json(404, { error: "Fonte não encontrada/inativa" });
  if (!(await secretsIguais(String(source.secret), secretHeader))) {
    return json(401, { error: "Secret inválido" });
  }

  // Cap de tamanho antes do parse (achado do review: sem limite, um secret
  // vazado infla webhook_events_in/custom_fields com megabytes)
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  if (contentLength > LIMITES.payloadTotalBytes) {
    return json(413, { error: "Payload acima de 64KB" });
  }
  const corpoBruto = await req.text();
  if (corpoBruto.length > LIMITES.payloadTotalBytes) {
    return json(413, { error: "Payload acima de 64KB" });
  }
  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoBruto);
  } catch {
    await registrarRejeicao(supabase, {
      organizationId: source.organization_id,
      sourceId,
      httpStatus: 400,
      reason: "JSON inválido",
    });
    return json(400, { error: "JSON inválido" });
  }

  if (reconcile) {
    const ids = (corpo as { external_event_ids?: unknown })?.external_event_ids;
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string") || ids.length > 5000) {
      return json(422, { error: "external_event_ids deve ser lista de strings (máx 5000)" });
    }
    const { data, error } = await supabase.rpc("reconcile_prospeccao", {
      p_source_id: sourceId,
      p_external_event_ids: ids,
    });
    if (error) return json(500, { error: "Falha na reconciliação" });
    return json(200, { ok: true, found: data ?? [] });
  }

  const validacao = validarPayloadProspeccao(corpo);
  if (!validacao.ok) {
    await registrarRejeicao(supabase, {
      organizationId: source.organization_id,
      sourceId,
      httpStatus: 422,
      reason: validacao.erro,
      externalEventId:
        typeof (corpo as { external_event_id?: unknown })?.external_event_id === "string"
          ? (corpo as { external_event_id: string }).external_event_id
          : null,
    });
    return json(422, { error: validacao.erro });
  }

  const { data, error } = await supabase.rpc("ingest_lead_prospeccao", {
    p_source_id: sourceId,
    p_payload: validacao.payload,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("T2_DUPLICATE_IN_FLIGHT")) {
      return json(409, { error: "Evento em processamento — aguarde e reenvie." });
    }
    if (msg.includes("T2_INVALID_PHONE") || msg.includes("T2_INVALID_PAYLOAD")) {
      const reason = msg.includes("T2_INVALID_PHONE") ? "Telefone inválido (E.164 BR)" : "Payload incompleto";
      await registrarRejeicao(supabase, {
        organizationId: source.organization_id,
        sourceId,
        httpStatus: 422,
        reason,
        externalEventId: (validacao.payload as { external_event_id: string }).external_event_id,
      });
      return json(422, { error: reason });
    }
    if (msg.includes("T2_INVALID_SOURCE")) return json(404, { error: "Fonte não encontrada/inativa" });
    // Sem error.message no log (achado do review: unique_violation inclui
    // VALORES da chave — telefone/correlation viraria PII nos logs retidos)
    const code = (error as { code?: string }).code ?? "unknown";
    console.error(
      "ingest-prospeccao: falha na RPC",
      JSON.stringify({ code, external_event_id: (validacao.payload as { external_event_id: string }).external_event_id }),
    );
    return json(500, { error: "Falha ao processar o lead" });
  }

  return json(200, data);
});
