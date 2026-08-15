/**
 * Webhook de entrada de leads (100% produto).
 *
 * Endpoint público para receber leads de Hotmart/forms/n8n/Make e criar:
 * - Contato (upsert por email/telefone)
 * - Deal (no board + estágio configurados na fonte)
 *
 * Rota (Supabase Edge Functions):
 * - `POST /functions/v1/webhook-in/<source_id>`
 *
 * Autenticação:
 * - Aceita **um** destes formatos:
 *   - Header `X-Webhook-Secret: <secret>`
 *   - Header `Authorization: Bearer <secret>`
 *   O valor deve bater com o `secret` da fonte em `integration_inbound_sources`.
 *
 * Observação:
 * - Este handler usa `SUPABASE_SERVICE_ROLE_KEY` (segredo padrão do Supabase) e ignora RLS.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  resolveEffectiveBoardId,
  resolveInitialStageId,
  shouldMoveExistingDeal,
} from "./stage-target-logic.ts";

type LeadPayload = {
  /**
   * ID do evento no sistema de origem (opcional).
   * Use quando sua origem for orientada a eventos (ex.: Hotmart) e você quiser idempotência contra retry.
   * Para “cadastro/atualização” (formulário), não é necessário.
   */
  external_event_id?: string;
  /** Nome do contato (legado) */
  name?: string;
  /** Email do contato */
  email?: string;
  /** Telefone do contato */
  phone?: string;
  source?: string;
  notes?: string;
  /** Nome da empresa (cliente) */
  company_name?: string;

  // ===== Campos "produto" (espelham o modal Novo Negócio) =====
  /** Nome do negócio */
  deal_title?: string;
  /** Valor estimado do negócio */
  deal_value?: number | string;
  /** Nome do contato principal (alias) */
  contact_name?: string;

  // Aliases comuns (camelCase / curtos)
  companyName?: string;
  dealTitle?: string;
  dealValue?: number | string;
  contactName?: string;
  title?: string;
  value?: number | string;
  company?: string;

  /**
   * T3b: estágio do board "negociação" pra onde o deal deve ser movido
   * (ex: "proposta-enviada", "proposta-aceita", "pagamento-recebido").
   * Campo opcional — payloads sem ele continuam funcionando exatamente como
   * antes (retrocompatibilidade total com integrações existentes). Slug
   * desconhecido/inválido é ignorado silenciosamente (best-effort, não
   * derruba o resto do webhook).
   */
  target_stage_slug?: string;

  /**
   * T4: link público da proposta comercial (Gerador de Propostas), enviado
   * junto do evento 'enviada' (target_stage_slug='proposta-enviada').
   * Persistido em deals.proposal_link — alimenta o botão manual de WhatsApp
   * no CRM-EA e o disparo automático (ver bloco T4 abaixo).
   */
  link_publico?: string;
};

const corsHeaders = {
  // NOTE: Para chamadas a partir do browser (UI "Enviar teste") precisamos de CORS.
  // Edge Functions do Supabase são cross-origin em relação ao app, então o navegador
  // faz um preflight (OPTIONS), especialmente com JSON/headers custom.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Secret, Authorization",
  // Ajuda no debug/observabilidade
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getSourceIdFromPath(req: Request): string | null {
  const url = new URL(req.url);
  // pathname esperado: /functions/v1/webhook-in/<source_id>
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "webhook-in");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

function normalizePhone(phone?: string) {
  if (!phone) return null;
  const cleaned = phone.trim();
  return cleaned || null;
}

function getSecretFromRequest(req: Request) {
  const xSecret = req.headers.get("X-Webhook-Secret") || "";
  if (xSecret.trim()) return xSecret.trim();

  const auth = req.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();

  return "";
}

/**
 * Hardening T2: comparação de secret em tempo constante (`!==` vaza timing).
 * Compara digests SHA-256 — tamanho fixo, XOR por byte sem short-circuit.
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

function toNullableString(v: unknown) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function toNullableNumber(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    // aceita "1.234,56" e "1234.56"
    const normalized = trimmed.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getCompanyName(payload: LeadPayload) {
  return (
    toNullableString(payload.company_name) ||
    toNullableString(payload.companyName) ||
    toNullableString(payload.company) ||
    null
  );
}

function getContactName(payload: LeadPayload) {
  return (
    toNullableString(payload.contact_name) ||
    toNullableString(payload.contactName) ||
    toNullableString(payload.name) ||
    null
  );
}

function getDealTitle(payload: LeadPayload) {
  return (
    toNullableString(payload.deal_title) ||
    toNullableString(payload.dealTitle) ||
    toNullableString(payload.title) ||
    null
  );
}

function getDealValue(payload: LeadPayload) {
  return (
    toNullableNumber(payload.deal_value) ??
    toNullableNumber(payload.dealValue) ??
    toNullableNumber(payload.value) ??
    null
  );
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  const sourceId = getSourceIdFromPath(req);
  if (!sourceId) return json(404, { error: "source_id ausente na URL" });

  const secretHeader = getSecretFromRequest(req);
  if (!secretHeader) return json(401, { error: "Secret ausente" });

  // Prefer custom secrets (installer-managed) to avoid reserved `SUPABASE_` prefix restrictions.
  // Fallback to Supabase-provided envs when available.
  // New key format: CRM_SUPABASE_SECRET_KEY, legacy: CRM_SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = Deno.env.get("CRM_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("CRM_SUPABASE_SECRET_KEY") ??
    Deno.env.get("CRM_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "Supabase não configurado no runtime" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: source, error: sourceErr } = await supabase
    .from("integration_inbound_sources")
    .select("id, organization_id, entry_board_id, entry_stage_id, secret, active")
    .eq("id", sourceId)
    .maybeSingle();

  // Hardening T2: pré-auth nunca vaza detalhes internos; secret em tempo constante
  if (sourceErr) return json(500, { error: "Erro ao buscar fonte" });
  if (!source || !source.active) return json(404, { error: "Fonte não encontrada/inativa" });
  if (!(await secretsIguais(String(source.secret), String(secretHeader)))) {
    return json(401, { error: "Secret inválido" });
  }

  let payload: LeadPayload;
  try {
    payload = (await req.json()) as LeadPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const leadName = getContactName(payload);
  const leadEmail = payload.email?.trim()?.toLowerCase() || null;
  const leadPhone = normalizePhone(payload.phone || undefined);
  const externalEventId = payload.external_event_id?.trim() || null;
  const companyName = getCompanyName(payload);
  const dealTitleFromPayload = getDealTitle(payload);
  const dealValue = getDealValue(payload);
  const targetStageSlug = toNullableString(payload.target_stage_slug);
  const linkPublico = toNullableString(payload.link_publico);

  // T3b: resolve o slug (dado externo, não confiável) pro id real do
  // estágio no board "negociação" dessa org via RPC — retorna null se o
  // slug não existir/não bater com nenhum board_stage (best-effort, não
  // falha o webhook). Payloads sem target_stage_slug pulam isso inteiro:
  // targetStageId fica null e o resto do fluxo se comporta exatamente como
  // antes desta mudança (retrocompatibilidade).
  let targetStageId: string | null = null;
  // T3b bugfix (achado no /qa 2026-08-03): o board do deal-alvo não é
  // necessariamente o board_id fixo desta fonte (entry_board_id) — esta
  // mesma fonte também recebe pagamento_recebido, cujo board de entrada é
  // o pós-venda, não o negociação. Quando o payload resolve um estágio real
  // (enviada/aprovada), o board correto é o board DO ESTÁGIO resolvido, não
  // o board de entrada da fonte. Sem isso, target_stage_slug nunca encontra
  // o deal certo pra eventos que não sejam pagamento_recebido — no-op
  // silencioso, confirmado em produção.
  let effectiveBoardId = source.entry_board_id;
  if (targetStageSlug) {
    const { data: resolvedStageId, error: resolveStageErr } = await supabase.rpc(
      "resolve_negociacao_stage_id",
      { p_org: source.organization_id, p_slug: targetStageSlug },
    );
    if (resolveStageErr) {
      console.error("Falha ao resolver target_stage_slug:", resolveStageErr.message);
    } else {
      targetStageId = (resolvedStageId as string | null) ?? null;
      if (targetStageId) {
        const { data: stageBoard, error: stageBoardErr } = await supabase
          .from("board_stages")
          .select("board_id")
          .eq("id", targetStageId)
          .maybeSingle();
        if (stageBoardErr) {
          console.error("Falha ao resolver board do target_stage_slug:", stageBoardErr.message);
        } else {
          effectiveBoardId = resolveEffectiveBoardId(
            (stageBoard?.board_id as string | null) ?? null,
            source.entry_board_id,
          );
        }
      }
    }
  }

  // 1) Auditoria/dedupe (idempotente quando external_event_id existe)
  if (externalEventId) {
    const { error: insertEventErr } = await supabase
      .from("webhook_events_in")
      .insert({
        organization_id: source.organization_id,
        source_id: source.id,
        provider: payload.source || "generic",
        external_event_id: externalEventId,
        payload: payload as unknown as Record<string, unknown>,
        status: "received",
      });

    // Unique violation (dedupe) -> retorna ids já processados (idempotência)
    if (insertEventErr) {
      const msg = String(insertEventErr.message).toLowerCase();
      if (!msg.includes("duplicate")) {
        return json(500, { error: "Falha ao registrar evento", details: insertEventErr.message });
      }

      const { data: existingEvent, error: existingEventErr } = await supabase
        .from("webhook_events_in")
        .select("created_contact_id, created_deal_id, status")
        .eq("source_id", source.id)
        .eq("external_event_id", externalEventId)
        .maybeSingle();

      if (!existingEventErr && existingEvent?.created_deal_id) {
        return json(200, {
          ok: true,
          duplicate: true,
          message: "Recebido! Esse envio já tinha sido processado (não duplicamos nada).",
          organization_id: source.organization_id,
          contact_id: existingEvent.created_contact_id ?? null,
          deal_id: existingEvent.created_deal_id,
          status: existingEvent.status ?? "processed",
        });
      }
      // se ainda não tem IDs gravados, seguimos o fluxo (best-effort)
    }
  }

  // 2) Upsert de contato (por email e/ou telefone)
  let contactId: string | null = null;
  let clientCompanyId: string | null = null;
  let contactAction: "created" | "updated" | "none" = "none";
  let companyAction: "created" | "linked" | "none" = "none";

  // 2.0) Empresa (best-effort): cria/vincula em crm_companies quando companyName existir
  if (companyName) {
    try {
      const { data: existingCompany, error: companyFindErr } = await supabase
        .from("crm_companies")
        .select("id")
        .eq("organization_id", source.organization_id)
        .is("deleted_at", null)
        .eq("name", companyName)
        .limit(1)
        .maybeSingle();

      if (companyFindErr) throw companyFindErr;

      if (existingCompany?.id) {
        clientCompanyId = existingCompany.id as string;
        companyAction = "linked";
      } else {
        const { data: createdCompany, error: companyCreateErr } = await supabase
          .from("crm_companies")
          .insert({
            organization_id: source.organization_id,
            name: companyName,
          })
          .select("id")
          .single();

        if (companyCreateErr) throw companyCreateErr;
        clientCompanyId = (createdCompany as any)?.id ?? null;
        if (clientCompanyId) companyAction = "created";
      }
    } catch {
      // não bloqueia o fluxo do webhook
      clientCompanyId = null;
      companyAction = "none";
    }
  }

  if (leadEmail || leadPhone) {
    // Bugfix achado no /qa (2026-08-03): `.or("phone.eq.+5511...")` do
    // PostgREST/supabase-js não escapa '+' antes de virar querystring — '+'
    // em querystring HTTP é espaço, então "phone.eq.+5511999999999" chegava
    // no banco como "phone.eq. 5511999999999" e NUNCA batia com telefone
    // E.164 real (todo contato criado por integração usa '+'). Cada retry
    // criava um contato duplicado em vez de achar o existente. Trocado por
    // duas buscas .eq() sequenciais (telefone primeiro, e-mail depois) —
    // sem string interpolation, sem risco de encoding.
    let existingContacts:
      | { id: string; name: string | null; email: string | null; phone: string | null; organization_id: string }[]
      | null = null;

    if (leadPhone) {
      const { data, error: findByPhoneErr } = await supabase
        .from("contacts")
        .select("id, name, email, phone, organization_id")
        .eq("organization_id", source.organization_id)
        .eq("phone", leadPhone)
        .limit(1);
      if (findByPhoneErr) return json(500, { error: "Falha ao buscar contato", details: findByPhoneErr.message });
      existingContacts = data;
    }

    if ((!existingContacts || existingContacts.length === 0) && leadEmail) {
      const { data, error: findByEmailErr } = await supabase
        .from("contacts")
        .select("id, name, email, phone, organization_id")
        .eq("organization_id", source.organization_id)
        .eq("email", leadEmail)
        .limit(1);
      if (findByEmailErr) return json(500, { error: "Falha ao buscar contato", details: findByEmailErr.message });
      existingContacts = data;
    }

    if (existingContacts && existingContacts.length > 0) {
      const existing = existingContacts[0];
      contactId = existing.id;

      const updates: Record<string, unknown> = {};
      if (leadName && (!existing.name || existing.name === "Sem nome")) updates.name = leadName;
      if (leadEmail && !existing.email) updates.email = leadEmail;
      if (leadPhone && !existing.phone) updates.phone = leadPhone;
      if (companyName) updates.company_name = companyName;
      if (clientCompanyId) updates.client_company_id = clientCompanyId;
      if (payload.notes) updates.notes = payload.notes;
      if (payload.source) updates.source = payload.source;

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from("contacts")
          .update(updates)
          .eq("id", contactId);
        if (updErr) return json(500, { error: "Falha ao atualizar contato", details: updErr.message });
        contactAction = "updated";
      } else {
        contactAction = "none";
      }
    } else {
      const { data: created, error: createErr } = await supabase
        .from("contacts")
        .insert({
          organization_id: source.organization_id,
          name: leadName || leadEmail || leadPhone || "Lead",
          email: leadEmail,
          phone: leadPhone,
          source: payload.source || "webhook",
          company_name: companyName,
          client_company_id: clientCompanyId,
          notes: payload.notes || null,
        })
        .select("id")
        .single();

      if (createErr) return json(500, { error: "Falha ao criar contato", details: createErr.message });
      contactId = created?.id ?? null;
      if (contactId) contactAction = "created";
    }
  }

  // 3) Deal (cadastro/upsert):
  // - Se já existir um deal "em aberto" do mesmo contato no mesmo board, atualiza em vez de criar outro.
  // - Se não existir (ou não tiver contato), cria.
  const dealTitle = dealTitleFromPayload || leadName || leadEmail || leadPhone || "Novo Lead";

  let dealId: string | null = null;
  let dealAction: "created" | "updated" = "created";

  if (contactId) {
    const { data: existingDeal, error: findDealErr } = await supabase
      .from("deals")
      .select("id, stage_id, is_won, is_lost, custom_fields")
      .eq("organization_id", source.organization_id)
      .eq("board_id", effectiveBoardId)
      .eq("contact_id", contactId)
      .eq("is_won", false)
      .eq("is_lost", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findDealErr) {
      return json(500, { error: "Falha ao buscar deal existente", details: findDealErr.message });
    }

    if (existingDeal?.id) {
      dealId = existingDeal.id as string;
      dealAction = "updated";

      const updates: Record<string, unknown> = {
        title: dealTitle,
        updated_at: new Date().toISOString(),
      };
      if (dealValue !== null) updates.value = dealValue;
      if (clientCompanyId) updates.client_company_id = clientCompanyId;
      if (linkPublico) updates.proposal_link = linkPublico;

      // mantém stage atual (não “puxa” de volta pro stage de entrada)
      // apenas carimba metadados do inbound.
      // Hardening T2: MERGE com o custom_fields existente — sobrescrever o
      // JSONB inteiro apagava dados do agente/fundadora no reenvio.
      const existingCustomFields =
        (existingDeal as { custom_fields?: Record<string, unknown> }).custom_fields ?? {};
      updates.custom_fields = {
        ...existingCustomFields,
        inbound_source_id: source.id,
        inbound_external_event_id: externalEventId,
        inbound_company_name: companyName,
      };

      const { error: updDealErr } = await supabase
        .from("deals")
        .update(updates)
        .eq("id", dealId);

      if (updDealErr) return json(500, { error: "Falha ao atualizar deal", details: updDealErr.message });

      // T3b: move o deal pro estágio-alvo via RPC (não por UPDATE direto de
      // stage_id) — move_deal_to_stage sincroniza is_won/is_lost/closed_at
      // conforme boards.won_stage_id/lost_stage_id. Best-effort: uma falha
      // aqui não derruba o resto do webhook (contato/deal já foram
      // criados/atualizados com sucesso).
      if (shouldMoveExistingDeal(targetStageId, existingDeal.stage_id ?? null)) {
        const { error: moveErr } = await supabase.rpc("move_deal_to_stage", {
          p_deal_id: dealId,
          p_stage_id: targetStageId,
        });
        if (moveErr) {
          console.error("Falha ao mover deal pro target_stage_slug:", moveErr.message);
        }
      }
    }
  }

  if (!dealId) {
    const { data: createdDeal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: source.organization_id,
        title: dealTitle,
        value: dealValue ?? 0,
        probability: 10,
        priority: "medium",
        board_id: effectiveBoardId,
        // T3b: nasce direto no estágio-alvo quando o payload manda um
        // (ex: "enviada" chegando sem passar pelo T3 antes) — senão cai no
        // estágio de entrada padrão da fonte, como sempre foi.
        stage_id: resolveInitialStageId(targetStageId, source.entry_stage_id),
        contact_id: contactId,
        client_company_id: clientCompanyId,
        proposal_link: linkPublico,
        last_stage_change_date: new Date().toISOString(),
        tags: ["Novo"],
        custom_fields: {
          inbound_source_id: source.id,
          inbound_external_event_id: externalEventId,
          inbound_company_name: companyName,
        },
      })
      .select("id")
      .single();

    if (dealErr) return json(500, { error: "Falha ao criar deal", details: dealErr.message });
    dealId = createdDeal?.id ?? null;
    dealAction = "created";
  }

  // T4: WhatsApp automático — só no evento 'enviada' (target_stage_slug=
  // 'proposta-enviada'), quando a org tem o flag ligado e o contato tem
  // telefone. Fire-and-forget (decisão /plan-eng-review 2026-08-15): falha
  // de rede aqui só loga, não reprocessa — o e-mail já saiu e o deal já
  // moveu de estágio, WhatsApp automático é um efeito colateral secundário
  // com o botão manual como rede de segurança.
  //
  // Achado do /review (2026-08-15): 'proposta-enviada' chega tanto pelo
  // fluxo automático (deal passou por "Proposta pronta") quanto por clique
  // manual direto em Propostas (EnviarEmailButton, sem gate nenhum). Sem
  // essa checagem, WhatsApp automático dispararia pra QUALQUER e-mail
  // manual — quebrando a garantia de revisão humana antes do disparo
  // automático (o gate só valia pro e-mail, não pro WhatsApp). Confirma
  // aqui, consultando o próprio outbox desta org (mesmo banco, sem
  // depender do Propostas saber a "origem" do envio), que este deal_id
  // realmente passou pelo estágio "Proposta pronta" pelo menos uma vez.
  if (dealId && linkPublico && targetStageSlug === "proposta-enviada") {
    try {
      const { data: passouPeloGate, error: gateErr } = await supabase
        .from("deal_stage_events")
        .select("id")
        .eq("deal_id", dealId)
        .eq("stage_slug", "proposta-pronta")
        .limit(1)
        .maybeSingle();

      if (gateErr) {
        console.error("Falha ao checar gate 'proposta-pronta':", gateErr.message);
      } else if (!passouPeloGate) {
        console.log("T4: e-mail 'enviada' sem passar pelo gate 'proposta-pronta' — WhatsApp automático pulado (provável envio manual)", { deal_id: dealId });
      } else {
        const { data: orgSettings, error: orgSettingsErr } = await supabase
          .from("organization_settings")
          .select("auto_send_proposal_whatsapp")
          .eq("organization_id", source.organization_id)
          .maybeSingle();

        if (orgSettingsErr) {
          console.error("Falha ao ler auto_send_proposal_whatsapp:", orgSettingsErr.message);
        } else if (orgSettings?.auto_send_proposal_whatsapp && !leadPhone) {
          console.log("T4: WhatsApp automático ligado mas contato sem telefone — pulado", { deal_id: dealId });
        } else if (orgSettings?.auto_send_proposal_whatsapp && leadPhone) {
          const appUrl = Deno.env.get("CRM_EA_APP_URL");
          const internalSecret = Deno.env.get("CRM_EA_INTERNAL_WEBHOOK_SECRET");
          if (!appUrl || !internalSecret) {
            console.error("T4: CRM_EA_APP_URL/CRM_EA_INTERNAL_WEBHOOK_SECRET não configurados — WhatsApp automático pulado");
          } else {
            const resp = await fetch(`${appUrl}/api/internal/auto-whatsapp-proposta`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Internal-Secret": internalSecret },
              body: JSON.stringify({
                organization_id: source.organization_id,
                deal_id: dealId,
                phone: leadPhone,
                link: linkPublico,
              }),
              signal: AbortSignal.timeout(5000),
            }).catch((e) => {
              console.error("T4: falha de rede ao chamar auto-whatsapp-proposta:", e instanceof Error ? e.message : String(e));
              return null;
            });
            if (resp && !resp.ok) {
              console.error("T4: auto-whatsapp-proposta retornou erro:", resp.status, await resp.text().catch(() => ""));
            }
          }
        }
      }
    } catch (e) {
      console.error("T4: erro inesperado no disparo de WhatsApp automático:", e instanceof Error ? e.message : String(e));
    }
  }

  // Atualiza auditoria (best-effort)
  if (externalEventId) {
    await supabase
      .from("webhook_events_in")
      .update({
        status: "processed",
        created_contact_id: contactId,
        created_deal_id: dealId,
      })
      .eq("source_id", source.id)
      .eq("external_event_id", externalEventId);
  }

  return json(200, {
    ok: true,
    message:
      dealAction === "updated"
        ? "Recebido! Atualizamos o negócio existente com os dados mais recentes."
        : "Recebido! Criamos um novo negócio no funil configurado.",
    action: {
      contact: contactAction,
      company: companyAction,
      deal: dealAction,
    },
    organization_id: source.organization_id,
    contact_id: contactId,
    deal_id: dealId,
  });
});

