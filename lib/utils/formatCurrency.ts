/**
 * @fileoverview Formatação de moeda (BRL) compartilhada.
 *
 * Extraído durante o redesign de Dashboard/Relatórios (2026-08) — o handoff
 * usa formato brasileiro ("R$ 184.500"), diferente do `$X.toLocaleString()`
 * usado antes nessas telas.
 *
 * @module lib/utils/formatCurrency
 */

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Formata um valor numérico como moeda brasileira sem centavos: "R$ 184.500". */
export function formatBRL(value: number): string {
  return BRL_FORMATTER.format(value || 0);
}

/** Formata um valor compacto em milhares: "R$ 46k" (ou "R$ 1.2M" acima de 1 milhão). */
export function formatCompactBRL(value: number): string {
  const abs = Math.abs(value || 0);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R$ ${Math.round(abs / 1_000)}k`;
  return `${sign}R$ ${Math.round(abs)}`;
}
