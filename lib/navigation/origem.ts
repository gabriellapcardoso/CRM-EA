/**
 * @fileoverview Origem de navegação — "voltar" que sabe de onde a pessoa veio.
 *
 * O botão de voltar do cockpit apontava sempre pra `/boards`. Quem chegou pelo
 * Inbox, por um contato ou por uma decisão da IA era jogado no kanban, que não
 * é a tela de onde saiu: o contexto de trabalho se perde e o caminho de volta
 * vira uma segunda navegação manual.
 *
 * A origem viaja na URL (`?from=inbox`) em vez de sair do histórico do
 * navegador. `history.back()` sozinho não serve pra escrever o RÓTULO: o
 * histórico não é legível por script (só o comprimento), e `document.referrer`
 * vem vazio em navegação client-side do App Router — o rótulo cairia no
 * genérico "voltar" justamente nos casos em que ele mais importa. Com o
 * parâmetro, o rótulo e o destino saem do mesmo lugar e não podem divergir.
 *
 * @module lib/navigation/origem
 */

/** Telas que podem levar a um detalhe. `undefined` = entrada direta/link colado. */
export type OrigemId =
  | 'inbox'
  | 'contato'
  | 'contatos'
  | 'board'
  | 'negociacao'
  | 'decisoes'
  | 'deal';

export interface Origem {
  /** Rota de destino do voltar. */
  href: string;
  /** Rótulo já escrito, incluindo a seta. */
  label: string;
}

/** Padrão quando não veio `?from=` — o kanban, que era o comportamento antigo. */
const PADRAO: Origem = { href: '/boards', label: '← voltar pra negociação' };

/** Padrão do detalhe do contato: a lista de contatos, não o kanban. */
const PADRAO_CONTATO: Origem = { href: '/contacts', label: '← voltar pra contatos' };

const MAPA: Record<OrigemId, Origem> = {
  inbox: { href: '/inbox', label: '← voltar pro inbox' },
  contato: { href: '/contacts', label: '← voltar pro contato' },
  contatos: { href: '/contacts', label: '← voltar pra contatos' },
  board: { href: '/boards', label: '← voltar pro board' },
  negociacao: PADRAO,
  decisoes: { href: '/decisions', label: '← voltar pras decisões' },
  deal: { href: '/boards', label: '← voltar pro deal' },
};

/**
 * Resolve o botão de voltar a partir do `?from=` (e do `?fromId=`, quando a
 * origem é um registro específico, como um contato).
 *
 * @param from Valor cru do parâmetro `from`; qualquer coisa fora do mapa cai no padrão.
 * @param fromId Id do registro de origem, usado só por `from=contato`.
 * @returns Destino e rótulo do voltar.
 */
export function resolverOrigem(from?: string | null, fromId?: string | null): Origem {
  // `Object.hasOwn`, não `in`: o `in` percorre a cadeia de protótipos, então
  // `?from=toString` (ou `constructor`, `hasOwnProperty`, `valueOf`) passava na
  // guarda e devolvia uma função — `href` e `label` saíam `undefined`, o botão
  // renderizava vazio e o `router.push(undefined)` ia junto. O valor vem da URL,
  // que qualquer pessoa edita.
  const base = from && Object.hasOwn(MAPA, from) ? MAPA[from as OrigemId] : PADRAO;
  if (from === 'contato' && fromId) {
    return { href: `/contacts/${fromId}`, label: base.label };
  }
  if (from === 'deal' && fromId) {
    return { href: `/deals/${fromId}/cockpit-v2`, label: base.label };
  }
  return base;
}

/**
 * Mesma resolução, com o padrão da lista de contatos em vez do kanban.
 *
 * O detalhe do contato é alcançável pela lista E pelo cockpit de um deal
 * ("ver contato completo"). Cair no kanban quando não há `?from=` mandaria a
 * pessoa pra uma tela que ela não estava vendo.
 *
 * @param from Valor cru do parâmetro `from`.
 * @param fromId Id do registro de origem, quando houver.
 * @returns Destino e rótulo do voltar.
 */
export function resolverOrigemDoContato(from?: string | null, fromId?: string | null): Origem {
  if (!from || !Object.hasOwn(MAPA, from)) return PADRAO_CONTATO;
  return resolverOrigem(from, fromId);
}
