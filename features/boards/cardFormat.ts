/**
 * @fileoverview Formatadores usados pelos cards/colunas do board (redesign 2026-08).
 *
 * O handoff mostra valores em BRL curto (`R$ 2.400`) e idade abreviada
 * (`8 min`, `3 h`, `ontem`, `2 sem`). Centralizado aqui para o card, o
 * cabeçalho da coluna e a lista usarem exatamente a mesma regra.
 *
 * @module features/boards/cardFormat
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `R$ 2.400` — sem centavos, como no handoff. */
export function formatCurrencyBRL(value: number | null | undefined): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  try {
    return BRL.format(n);
  } catch {
    return `R$ ${n}`;
  }
}

/** Iniciais (até 2 letras) de um nome, para `.avatar`. */
export function getInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Idade abreviada em pt-BR: `agora`, `8 min`, `3 h`, `ontem`, `4 d`, `2 sem`, `3 mes`.
 */
export function formatShortAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';

  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `${days} d`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} sem`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mes`;

  return `${Math.floor(days / 365)} a`;
}
