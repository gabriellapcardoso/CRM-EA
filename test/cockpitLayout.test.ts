/**
 * Guarda de layout do cockpit de governança do deal (2026-08-31).
 *
 * Por que é teste de CSS-como-texto e não de layout de verdade: happy-dom (e
 * jsdom) não têm engine de layout. `getBoundingClientRect()` devolve zeros e
 * `scrollWidth === clientWidth` sempre — qualquer teste de "não estoura"
 * renderizando o componente passaria por falso-positivo, dando a sensação de
 * cobertura sem cobrir nada. Então este arquivo afirma as INVARIANTES da regra
 * CSS, no mesmo molde de `test/softDeleteFilters.test.ts`. A verificação de que
 * o layout realmente cabe é medição no browser (ver DESAFIOS.md).
 *
 * O que estas invariantes protegem: a tela saiu de um grid de 3 painéis com 3
 * rolagens independentes e largura mínima travada, e virou coluna única com uma
 * rolagem só. Cada regra abaixo é uma regressão que já aconteceu de verdade.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')
const cockpitTsx = readFileSync(
  join(ROOT, 'features/deals/cockpit/DealCockpitClient.tsx'),
  'utf8',
)

/** Extrai o corpo `{ ... }` da primeira regra cujo seletor é exatamente `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`Regra CSS não encontrada: ${selector}`)
  return match[1]
}

describe('.cockpit__body — coluna única, uma rolagem', () => {
  it('não tem min-width fixo (era 1180px e forçava scroll horizontal na página)', () => {
    // O 1180 era herança do handoff HTML (d924a86), não cálculo: o piso real
    // das colunas era 288+420+320 = 1028px.
    expect(rule('.cockpit__body')).not.toMatch(/min-width:\s*\d/)
  })

  it('não é mais um grid de colunas', () => {
    const r = rule('.cockpit__body')
    expect(r).not.toMatch(/grid-template-columns/)
    expect(r).toMatch(/flex-direction:\s*column/)
  })

  it('tem a única rolagem vertical da tela', () => {
    // Eram três `overflow-y: auto` independentes em 405px de altura. No macOS a
    // barra é overlay e some em repouso: a informação parecia não existir em
    // vez de estar abaixo.
    expect(rule('.cockpit__body')).toMatch(/overflow-y:\s*auto/)
    expect(rule('.cockpit__aside, .cockpit__center')).toMatch(/display:\s*contents/)
  })

  it('os blocos têm teto de largura de leitura, por seletor descendente', () => {
    // `display: contents` é regra de LAYOUT, não de DOM: os 3 containers
    // continuam sendo os filhos diretos de .cockpit__body na árvore. Um `> *`
    // casaria com eles (que não têm caixa) e não pintaria nada — bug real,
    // pego medindo no browser depois de o CSS já estar escrito.
    expect(css).not.toMatch(/\.cockpit__body > \*/)
    expect(css).toMatch(/\.cockpit__body \.cockpit__block[^{]*\{[^}]*max-width:\s*\d+px/)
  })
})

describe('ordem das seções — identificar, decidir, entender, consultar', () => {
  // `deal` e `contato` são separados de propósito: blocos com o mesmo `order`
  // caem na ordem do DOM, e ali o contato vem antes (JSX :1611 vs :1752) — o
  // inverso do que a tela pede.
  const ordem = ['deal', 'contato', 'decidir', 'historico', 'assistente', 'ref']

  it.each(ordem.map((nome, i) => [nome, i + 1] as const))(
    '.cockpit__sec--%s tem order: %i',
    (nome, esperado) => {
      expect(rule(`.cockpit__sec--${nome}`)).toMatch(new RegExp(`order:\\s*${esperado}\\s*;`))
    },
  )

  it('nenhum CockpitBlock fica sem classe de seção', () => {
    // `order` só funciona porque os containers são `display: contents` e os
    // blocos são irmãos diretos do flex. Um bloco sem classe cai em `order: 0`
    // e vai parar ANTES da decisão, no topo da tela, silenciosamente.
    //
    // A versão anterior deste teste comparava 12 marcações contra 8 blocos com
    // `toBeGreaterThanOrEqual` — quatro vagas de folga. Dava pra adicionar
    // quatro blocos sem classe e o teste seguia verde, permitindo exatamente a
    // regressão que o parágrafo acima descreve. Achado no review retroativo
    // (issue #20).
    //
    // Agora conta os que NÃO têm: tem que ser zero.
    const semClasse = [...cockpitTsx.matchAll(/<CockpitBlock\b([\s\S]{0,220}?)>/g)].filter(
      (m) => !m[1].includes('cockpit__sec--'),
    )
    expect(semClasse.map((m) => m[0].slice(0, 80))).toEqual([])
  })

  it('as demais seções do corpo também são marcadas', () => {
    // card-hitl, a timeline e os dois Panel não são CockpitBlock e cairiam em
    // order: 0 do mesmo jeito.
    for (const marcador of ['card-hitl cockpit__sec--', 'panel--flush cockpit__sec--']) {
      expect(cockpitTsx).toContain(marcador)
    }
    const panels = [...cockpitTsx.matchAll(/<Panel\b([\s\S]{0,160}?)>/g)].filter(
      (m) => !m[1].includes('cockpit__sec--'),
    )
    expect(panels.map((m) => m[0].slice(0, 60))).toEqual([])
  })
})

describe('.channel-actions — os 4 botões cabem na coluna', () => {
  it('usa grid auto-fit, não flex-wrap', () => {
    // Com flex-wrap a quebra depende do min-content de cada rótulo, então a
    // grade sai por acidente e reagrupa sozinha quando "enviar proposta" vira
    // "enviando..." em runtime. Grid é determinístico.
    const r = rule('.channel-actions')
    expect(r).toMatch(/display:\s*grid/)
    expect(r).toMatch(/repeat\(\s*auto-fit\s*,\s*minmax\(/)
    // min(150px, 100%) impede a track de estourar num container muito estreito.
    expect(r).toMatch(/min\(\s*150px\s*,\s*100%\s*\)/)
  })

  it('o botão pode encolher abaixo do próprio conteúdo', () => {
    // `min-width: auto` implícito de item flex era o que travava o encolhimento
    // e fazia os botões cortarem na borda do aside (327px em 288px).
    expect(rule('.channel-actions__btn')).toMatch(/min-width:\s*0\s*;/)
  })
})

describe('.stepper — estágios visíveis sem rolar pro lado', () => {
  it('quebra linha em vez de rolar horizontalmente', () => {
    const r = rule('.stepper')
    expect(r).toMatch(/flex-wrap:\s*wrap/)
    expect(r).not.toMatch(/overflow-x:\s*auto/)
  })

  it('tem teto de altura', () => {
    // A quantidade de estágios é dinâmica (`selectedBoard.stages`, por board e
    // por organização), não fixa em 15. Sem teto, um board de 20 estágios
    // renderiza 3-4 linhas e come ~110px da altura útil.
    const r = rule('.stepper')
    expect(r).toMatch(/max-height:\s*\d+px/)
    expect(r).toMatch(/overflow-y:\s*auto/)
  })
})

describe('.cockpit__head — altura devolvida ao corpo', () => {
  it('o título tem teto de largura, senão a linha do cabeçalho quebra em duas', () => {
    // Os filhos de .cockpit__head-top somavam 1194px + 96px de gaps em 1155px
    // disponíveis. A 2ª linha custava 48px da altura útil.
    const r = rule('.cockpit__title')
    expect(r).toMatch(/max-width:\s*\d+px/)
    expect(r).toMatch(/text-overflow:\s*ellipsis/)
  })

  it('não mexe no .cockpit__value global (o modal de detalhe do deal usa)', () => {
    // DealDetailModal.tsx:500 herda essa classe e não tem aperto de altura.
    expect(rule('.cockpit__value')).not.toMatch(/line-height/)
    expect(css).toMatch(/\.cockpit__head-top \.cockpit__value \{[^}]*line-height/)
  })
})

describe('painel de chat do cockpit', () => {
  it('não tem altura fixa maior que a coluna que o contém', () => {
    // Era `height: 420` numa coluna de ~461px de altura útil: scroll dentro de
    // scroll, com a roda do mouse rolando o elemento errado.
    expect(cockpitTsx).not.toMatch(/style=\{\{\s*height:\s*420\s*,/)
    expect(cockpitTsx).toMatch(/height:\s*'clamp\(/)
  })
})
