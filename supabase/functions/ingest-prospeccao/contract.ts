/**
 * T2 — Contrato do payload Prospecção → CRM.
 *
 * TS puro, sem dependências e sem APIs Deno DE PROPÓSITO: este arquivo é
 * importado tanto pela edge function (Deno) quanto pelo teste de contrato do
 * repositório (`test/prospeccaoContract.test.ts`, Vitest), que valida a
 * fixture compartilhada `test/fixtures/t2-payload.json`. A mesma fixture vive
 * no repo da prospecção (`lib/fixtures/t2-payload.json`) — fonte de verdade
 * documentada no HANDOFF.md do gerador de propostas.
 */

export interface PayloadProspeccao {
  external_event_id: string;
  correlation_id: string;
  ciclo: number;
  origem: "prospeccao-aaagencia";
  lead: {
    nome: string;
    telefone: string;
    email: string | null;
    instagram: string | null;
    motor: string;
    nota: number | null;
    motivo: string | null;
  };
  demo: { link: string | null; tipo: "link" | "pdf" };
  mensagem_whatsapp: string;
  mensagem_email: string;
  enviado_em: string;
}

export type ResultadoValidacao =
  | { ok: true; payload: PayloadProspeccao }
  | { ok: false; erro: string };

/** Limites de tamanho (achado do review: sem cap, um secret vazado infla o banco). */
export const LIMITES = {
  campoCurto: 256,
  mensagem: 4096,
  payloadTotalBytes: 64 * 1024,
} as const;

function texto(v: unknown, max = LIMITES.campoCurto): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function textoOuNulo(v: unknown, max = LIMITES.campoCurto): boolean {
  return v === null || (typeof v === "string" && v.length <= max);
}

export function validarPayloadProspeccao(bruto: unknown): ResultadoValidacao {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return { ok: false, erro: "payload deve ser um objeto JSON" };
  }
  const p = bruto as Record<string, unknown>;

  if (!texto(p.external_event_id)) return { ok: false, erro: "external_event_id obrigatório" };
  if (!/^lead:.+:demo:\d+$/.test(p.external_event_id as string)) {
    return { ok: false, erro: "external_event_id fora do formato lead:{id}:demo:{ciclo}" };
  }
  if (!texto(p.correlation_id)) return { ok: false, erro: "correlation_id obrigatório" };
  if (typeof p.ciclo !== "number" || !Number.isInteger(p.ciclo) || p.ciclo < 0) {
    return { ok: false, erro: "ciclo deve ser inteiro >= 0" };
  }
  // Consistência interna (achado do review): a chave é derivada de
  // correlation_id+ciclo — divergência corromperia dedupe e reconciliação.
  if (p.external_event_id !== `lead:${p.correlation_id}:demo:${p.ciclo}`) {
    return { ok: false, erro: "external_event_id inconsistente com correlation_id/ciclo" };
  }
  if (p.origem !== "prospeccao-aaagencia") return { ok: false, erro: "origem inválida" };

  const lead = p.lead as Record<string, unknown> | undefined;
  if (typeof lead !== "object" || lead === null) return { ok: false, erro: "lead obrigatório" };
  if (!texto(lead.nome)) return { ok: false, erro: "lead.nome obrigatório" };
  if (!texto(lead.telefone)) return { ok: false, erro: "lead.telefone obrigatório" };
  if (!/^\+55\d{10,11}$/.test(lead.telefone as string)) {
    return { ok: false, erro: "lead.telefone deve estar em E.164 BR (+55...)" };
  }
  if (!textoOuNulo(lead.email ?? null)) return { ok: false, erro: "lead.email deve ser string ou null" };
  if (!textoOuNulo(lead.instagram ?? null)) return { ok: false, erro: "lead.instagram deve ser string ou null" };
  if (lead.nota !== null && lead.nota !== undefined && typeof lead.nota !== "number") {
    return { ok: false, erro: "lead.nota deve ser number ou null" };
  }

  const demo = p.demo as Record<string, unknown> | undefined;
  if (typeof demo !== "object" || demo === null) return { ok: false, erro: "demo obrigatório" };
  if (demo.tipo !== "link" && demo.tipo !== "pdf") return { ok: false, erro: "demo.tipo deve ser link|pdf" };
  if (demo.tipo === "link" && !texto(demo.link, 2048)) return { ok: false, erro: "demo.link obrigatório quando tipo=link" };
  if (!textoOuNulo(demo.link ?? null, 2048)) return { ok: false, erro: "demo.link deve ser string ou null" };

  if (!texto(p.mensagem_whatsapp, LIMITES.mensagem)) return { ok: false, erro: "mensagem_whatsapp obrigatória (máx 4096)" };
  if (!texto(p.mensagem_email, LIMITES.mensagem)) return { ok: false, erro: "mensagem_email obrigatória (máx 4096)" };
  if (!texto(p.enviado_em) || Number.isNaN(Date.parse(p.enviado_em as string))) {
    return { ok: false, erro: "enviado_em deve ser data ISO válida" };
  }

  return { ok: true, payload: bruto as PayloadProspeccao };
}
