/**
 * T3 (emissor) — lógica pura do dispatcher de deal_stage_events.
 *
 * TS puro, sem dependências e sem APIs Deno DE PROPÓSITO (mesmo motivo do
 * contract.ts do T2): importado tanto pela Edge Function (Deno, index.ts)
 * quanto pelo teste Vitest deste repo (dispatcher-logic.test.ts). A parte
 * que faz I/O (fetch, leitura/escrita no Supabase) fica isolada em index.ts —
 * aqui só decisão.
 */

/** Teto geral de tentativas (401/404/5xx/timeout) antes de considerar falha permanente. */
export const MAX_ATTEMPTS = 5;

/** Teto de tentativas específico pra 422 (payload inválido não se corrige sozinho — não vale reprocessar tanto quanto falha transitória de rede). */
export const MAX_422_ATTEMPTS = 3;

export type StatusEvento = "pendente" | "enviado" | "falhou";

export interface ResultadoDispatch {
  /** Novo status a gravar em deal_stage_events.status */
  novoStatus: StatusEvento;
  /** Novo valor de attempt_count */
  attemptCount: number;
  /** true quando o evento não deve mais ser reprocessado pelo cron (attempt_count já no teto) */
  permanente: boolean;
}

/**
 * Decide o resultado de uma tentativa de envio a partir do status HTTP
 * retornado (ou `null` quando a requisição falhou antes de responder —
 * timeout do AbortSignal, erro de rede, DNS etc).
 *
 * Contrato do receptor (HANDOFF.md do gerador de propostas):
 *   200            → sucesso
 *   409            → corrida (evento já processado por outra tentativa) — tratado como sucesso
 *   422            → payload inválido — não fica reprocessando pra sempre
 *   401/404/5xx/—  → falha reciclável até MAX_ATTEMPTS
 */
export function decidirResultado(httpStatus: number | null, attemptCountAtual: number): ResultadoDispatch {
  if (httpStatus === 200 || httpStatus === 409) {
    return { novoStatus: "enviado", attemptCount: attemptCountAtual + 1, permanente: false };
  }

  const proximaTentativa = attemptCountAtual + 1;

  if (httpStatus === 422) {
    const permanente = proximaTentativa >= MAX_422_ATTEMPTS;
    return {
      novoStatus: "falhou",
      attemptCount: permanente ? MAX_ATTEMPTS : proximaTentativa,
      permanente,
    };
  }

  const permanente = proximaTentativa >= MAX_ATTEMPTS;
  return {
    novoStatus: "falhou",
    attemptCount: permanente ? MAX_ATTEMPTS : proximaTentativa,
    permanente,
  };
}

/** Um evento só é lido pelo cron se estiver pendente, ou falhou mas ainda não bateu o teto de tentativas. */
export function elegivelParaEnvio(status: StatusEvento, attemptCount: number): boolean {
  if (status === "pendente") return true;
  if (status === "falhou" && attemptCount < MAX_ATTEMPTS) return true;
  return false;
}

export interface DealStageEventPayload {
  external_event_id: string;
  deal_id: string;
  contador: number;
  organization_id: string;
  contact: { nome: string | null; telefone: string | null; email: string | null; empresa: string | null };
  deal: { titulo: string; valor: number | null; moeda: string };
  topou_em: string;
}

/** Payload do evento T3c (deal perdido → reaquecer lead na prospecção). */
export interface DealLostEventPayload {
  external_event_id: string;
  deal_id: string;
  correlation_id: string;
  motivo: string | null;
  perdido_em: string;
}

export interface DestinoEnv {
  PROPOSTAS_INGEST_URL?: string;
  PROPOSTAS_INGEST_SECRET?: string;
  PROSPECCAO_REAQUECER_URL?: string;
  PROSPECCAO_REAQUECER_SECRET?: string;
  PROPOSTAS_PRONTA_URL?: string;
  PROPOSTAS_PRONTA_SECRET?: string;
}

export interface Destino {
  url: string | undefined;
  secret: string | undefined;
}

/**
 * T4: 3º destino no outbox — proposta-pronta → Gerador de Propostas (rota
 * diferente de topou-proposta: dispara envio automático de e-mail/WhatsApp,
 * não criação de rascunho).
 *
 * T3c: `deal_stage_events` agora carrega eventos de 3 direções diferentes
 * (T3 topou-proposta → Gerador de Propostas, T3c perdido → Prospecção,
 * T4 proposta-pronta → Gerador de Propostas). Roteamento por `stage_slug`,
 * não por tabela nova — mesmo outbox, mesmo cron, destino HTTP diferente
 * por linha.
 */
export function resolverDestino(stageSlug: string, env: DestinoEnv): Destino {
  if (stageSlug === "perdido") {
    return { url: env.PROSPECCAO_REAQUECER_URL, secret: env.PROSPECCAO_REAQUECER_SECRET };
  }
  if (stageSlug === "proposta-pronta") {
    return { url: env.PROPOSTAS_PRONTA_URL, secret: env.PROPOSTAS_PRONTA_SECRET };
  }
  return { url: env.PROPOSTAS_INGEST_URL, secret: env.PROPOSTAS_INGEST_SECRET };
}

/**
 * O `payload` gravado pelo trigger SQL (emit_deal_stage_event, migration
 * 20260802120000) já é o corpo exato esperado pelo receptor — não precisa
 * remontar nada aqui. Função existe só pra documentar/tipar o contrato no
 * ponto de uso (index.ts) e dar um lugar único pra mudar se o contrato
 * divergir do payload gravado no futuro.
 */
export function montarCorpoRequisicao(payload: DealStageEventPayload): DealStageEventPayload {
  return payload;
}
