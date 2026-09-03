/**
 * @fileoverview Data no formato `YYYY-MM-DD` no fuso de quem está olhando.
 *
 * Existe porque `new Date().toISOString().split('T')[0]` — idioma espalhado por
 * 13 pontos deste repositório — converte pra **UTC** antes de cortar a data. Pra
 * quem está em São Paulo (GMT-3), toda hora local a partir das 21:00 já é o dia
 * seguinte em UTC.
 *
 * O efeito não é cosmético:
 *
 * - `useTodayActivities` monta o filtro de "hoje" assim. Das 21:00 à meia-noite,
 *   a lista de hoje passa a filtrar pela data de amanhã e esvazia.
 * - O formulário de atividade abre uma atividade das 22:00 mostrando o dia
 *   seguinte. Salvar move a atividade um dia pra frente — corrompe dado, não só
 *   exibe errado.
 * - Os botões "Hoje"/"Amanhã" de agendamento gravam um dia a mais.
 *
 * Três horas por noite, todas as noites, em silêncio.
 *
 * `lib/utils/activitySort.ts` já fazia certo, com `getFullYear/getMonth/getDate`.
 * Este módulo generaliza aquele padrão para quem precisa da string.
 *
 * @module lib/utils/dataLocal
 */

/**
 * Formata uma data como `YYYY-MM-DD` usando os componentes LOCAIS.
 *
 * Diferente de `toISOString().split('T')[0]`, que passa por UTC e pode devolver
 * o dia seguinte (ou o anterior, em fusos positivos).
 *
 * @param data Data a formatar. Default: agora.
 */
export function dataLocalISO(data: Date = new Date()): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** `YYYY-MM-DD` de hoje, no fuso de quem está olhando. */
export function hojeLocalISO(): string {
  return dataLocalISO(new Date());
}

/**
 * `YYYY-MM-DD` daqui a N dias, no fuso local.
 *
 * Usa `setDate`, que lida com virada de mês, ano e horário de verão sozinho —
 * somar milissegundos não faz isso.
 */
export function dataLocalISOEmDias(dias: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return dataLocalISO(d);
}
