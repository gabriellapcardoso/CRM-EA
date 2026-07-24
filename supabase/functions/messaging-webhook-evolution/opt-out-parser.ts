/**
 * @fileoverview Parser de keyword de opt-out (T4 — LGPD)
 *
 * Detecta se uma mensagem inbound do WhatsApp é um pedido de opt-out
 * (`sair`, `parar`, `descadastrar`, `stop`), por match exato ou início de
 * frase, case-insensitive. Ver T4-EXECUCAO.md item 2.
 */

const OPT_OUT_KEYWORDS = ['sair', 'parar', 'descadastrar', 'stop'];

export function matchesOptOutKeyword(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  return OPT_OUT_KEYWORDS.some((keyword) => {
    if (normalized === keyword) return true;
    return normalized.startsWith(`${keyword} `);
  });
}
