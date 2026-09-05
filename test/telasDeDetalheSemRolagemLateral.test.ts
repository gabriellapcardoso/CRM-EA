/**
 * Guarda da revisão de 2026-09-04 — "nenhuma tela de detalhe rola pro lado".
 *
 * Teste estático (CSS e JSX como texto) pelo mesmo motivo de
 * `test/cockpitLayout.test.ts`: happy-dom não tem engine de layout, então
 * `getBoundingClientRect()` devolve zero e `scrollWidth === clientWidth`
 * sempre — renderizar o componente e afirmar "não estoura" passaria por
 * falso-positivo. A medição de verdade é no browser.
 *
 * Comentários são removidos antes de casar: a prosa que explica cada conserto
 * contém as mesmas palavras das asserções e satisfaria todas elas sozinha —
 * já aconteceu duas vezes neste repositório (ver CLAUDE.md).
 */
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')

/** Lê um arquivo do repositório já sem comentários de bloco e de linha. */
function semComentarios(caminho: string): string {
  return readFileSync(join(ROOT, caminho), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

const css = semComentarios('app/globals.css')
const contactsPage = semComentarios('features/contacts/ContactsPage.tsx')
const contactsList = semComentarios('features/contacts/components/ContactsList.tsx')

/** Corpo `{ … }` da primeira regra cujo seletor é exatamente `seletor`. */
function regra(seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`^[ \\t]*${escapado}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  if (!m) throw new Error(`Regra CSS não encontrada: ${seletor}`)
  return m[1]
}

describe('lista de contatos cabe na tela', () => {
  it('só a lista de contatos dispensa o piso de 840px', () => {
    // O piso continua valendo pro resto: `.table-list` também veste a lista do
    // pipeline (KanbanList) e o catálogo de produtos, que têm outras colunas e
    // não passaram por esta revisão. Tirar de todas de uma vez espremeria
    // tabelas que ninguém mediu — foi o que a revisão adversarial pegou.
    expect(regra('.table-list')).toMatch(/min-width:\s*840px/)
    expect(regra('.table-list--fit')).toMatch(/min-width:\s*0/)
    // E a lista de contatos é quem usa o modificador — as DUAS tabelas dela
    // (pessoas e empresas).
    const usos = contactsList.match(/className="table-list table-list--fit"/g) ?? []
    expect(usos).toHaveLength(2)
  })

  it('a empresa é a segunda linha do nome, não uma coluna', () => {
    expect(css).toContain('.cell-name__stack')
    expect(contactsList).toContain('cell-name__stack')
    expect(contactsList).toContain('cell-name__co')
  })

  it('a célula do nome é um link de verdade pro detalhe', () => {
    // `onClick` na linha sozinho não abre em nova aba, não aparece pro leitor
    // de tela como destino e não mostra a URL na barra de status.
    expect(contactsList).toMatch(/className="table-list__link" href=\{`\/contacts\/\$\{contact\.id\}`\}/)
  })
})

describe('detalhe do contato é página, não gaveta', () => {
  it('a rota existe', () => {
    expect(existsSync(join(ROOT, 'app/(protected)/contacts/[contactId]/page.tsx'))).toBe(true)
    expect(existsSync(join(ROOT, 'features/contacts/detail/ContactDetailPage.tsx'))).toBe(true)
  })

  it('a lista não renderiza mais o .detail-pane', () => {
    // O drawer de 340px roubava largura da tabela e guardava o contato aberto
    // num useState — recarregar ou mandar o link devolvia a lista vazia.
    expect(contactsPage).not.toContain('detail-pane')
  })

  it('.detail-pane continua no CSS, porque o inbox ainda usa', () => {
    // Apagar a classe junto quebraria o inbox sem aviso: é a mesma folha.
    expect(css).toContain('.detail-pane')
  })
})

describe('card de aprovação da IA não tem coluna fixa', () => {
  it('.card-approval usa auto-fit', () => {
    // `1fr 268px` espremia o conteúdo à esquerda até estourar quando a largura
    // útil caía (barra lateral aberta + painel de IA aberto).
    const r = regra('.card-approval')
    expect(r).toMatch(/repeat\(\s*auto-fit\s*,\s*minmax\(/)
    expect(r).not.toMatch(/grid-template-columns:\s*1fr\s+268px/)
    // O piso do track precisa ceder ao container: `minmax(320px, …)` puro
    // sobrepõe a largura disponível e o card volta a rolar pro lado em tela
    // estreita — que é exatamente o bug que esta revisão foi consertar.
    expect(r).toMatch(/minmax\(\s*min\(\s*320px\s*,\s*100%\s*\)/)
  })
})

describe('voltar contextual', () => {
  it('o cockpit resolve o destino pelo ?from= em vez de ir sempre pro kanban', () => {
    const cockpit = semComentarios('features/deals/cockpit/DealCockpitClient.tsx')
    expect(cockpit).toContain('resolverOrigem(')
    expect(cockpit).toMatch(/router\.push\(origem\.href\)/)
    // O destino fixo antigo não pode voltar como fallback escondido no botão.
    expect(cockpit).not.toMatch(/className="btn btn--quiet" onClick=\{\(\) => router\.push\('\/boards'\)\}/)
  })

  it('quem abre o cockpit diz de onde veio', () => {
    expect(semComentarios('features/boards/components/PipelineView.tsx')).toContain('?from=board')
    expect(semComentarios('features/decisions/DecisionQueuePage.tsx')).toContain('?from=decisoes')
    expect(semComentarios('features/contacts/detail/ContactDetailPage.tsx')).toContain('from=contato')
  })
})

describe('origem da navegação aceita só o que está no mapa', () => {
  it('chave de protótipo não vira destino', async () => {
    // `from in MAPA` percorria a cadeia de protótipos: `?from=toString` passava
    // na guarda e devolvia uma função, então href e label saíam `undefined` — o
    // botão renderizava vazio e o router.push ia com undefined. O valor vem da
    // URL, que qualquer pessoa edita.
    const { resolverOrigem } = await import('../lib/navigation/origem')
    for (const chave of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__']) {
      const origem = resolverOrigem(chave)
      expect(origem.href, `from=${chave}`).toBe('/boards')
      expect(origem.label, `from=${chave}`).toMatch(/^←/)
    }
  })

  it('as origens de verdade continuam resolvendo', async () => {
    const { resolverOrigem } = await import('../lib/navigation/origem')
    expect(resolverOrigem('inbox').href).toBe('/inbox')
    expect(resolverOrigem('decisoes').href).toBe('/decisions')
    expect(resolverOrigem('contato', 'abc-123').href).toBe('/contacts/abc-123')
    expect(resolverOrigem(null).href).toBe('/boards')
  })
})

describe('link da proposta passa pelo filtro de esquema', () => {
  it('o href não recebe deal.proposalLink cru', () => {
    // `deals.proposal_link` é gravado verbatim do payload do webhook
    // (supabase/functions/webhook-in/index.ts) sem checagem de esquema. Este é o
    // único ponto que transforma esse valor em href.
    const cockpit = semComentarios('features/deals/cockpit/DealCockpitClient.tsx')
    expect(cockpit).not.toMatch(/href=\{deal\.proposalLink\}/)
    expect(cockpit).toMatch(/sanitizeUrl\(\s*selectedDeal\?\.proposalLink\s*\)/)
  })
})

describe('empresa longa não engole o badge de estágio', () => {
  it('o truncamento fica no filho, não no container flex', () => {
    // `text-overflow: ellipsis` não se aplica a container flex: o texto cortava
    // seco e empurrava o badge pra fora da caixa. O estágio perdeu a coluna
    // própria nesta revisão, então ele sumia sem deixar rastro.
    const co = regra('.cell-name__co')
    expect(co).toMatch(/display:\s*flex/)
    expect(co).not.toMatch(/text-overflow/)
    expect(regra('.cell-name__co-text')).toMatch(/text-overflow:\s*ellipsis/)
    expect(contactsList).toContain('cell-name__co-text')
    // Quem está ao lado do texto não pode encolher junto. Alvo por posição:
    // `StageBadge` renderiza utilitários do Tailwind, não `.badge-stage` —
    // mirar aquela classe era regra morta (verificado no DOM de produção).
    expect(css).toContain('.cell-name__co > :not(.cell-name__co-text)')
    expect(css).not.toContain('.cell-name__co .badge-stage')
  })
})

describe('detalhe do contato busca por id', () => {
  it('useContact não varre a lista de 1000', () => {
    // `getAll()` tem teto de 1000 linhas; um contato fora do lote devolvia null,
    // indistinguível de "não existe", numa URL feita pra ser compartilhada.
    const hook = semComentarios('lib/query/hooks/useContactsQuery.ts')
    const inicio = hook.indexOf('export const useContact =')
    expect(inicio).toBeGreaterThan(-1)
    const corpo = hook.slice(inicio, hook.indexOf('export const useContactsByCompany'))
    expect(corpo).toContain('getByIds(')
    expect(corpo).not.toContain('getAll()')
    expect(semComentarios('features/contacts/detail/ContactDetailPage.tsx')).toContain('useContact(contactId)')
  })
})

describe('origem sobrevive à navegação dentro do cockpit', () => {
  it('trocar de deal no seletor não apaga o ?from=', () => {
    // `router.replace(`/deals/${id}/cockpit-v2`)` descartava a query, e o voltar
    // contextual degradava pro padrão /boards sem nada mudar de aparência.
    const cockpit = semComentarios('features/deals/cockpit/DealCockpitClient.tsx')
    expect(cockpit).not.toMatch(/router\.replace\(`\/deals\/\$\{nextDealId\}\/cockpit-v2`\)/)
    expect(cockpit).toMatch(/cockpit-v2\$\{query \? `\?\$\{query\}` : ''\}/)
  })

  it('"ver contato completo" leva o deal de origem junto', () => {
    const cockpit = semComentarios('features/deals/cockpit/DealCockpitClient.tsx')
    expect(cockpit).toMatch(/\/contacts\/\$\{contact\.id\}\?from=deal&fromId=\$\{deal\.id\}/)
  })

  it('o detalhe do contato volta pra origem, com padrão na lista', async () => {
    const { resolverOrigemDoContato } = await import('../lib/navigation/origem')
    expect(resolverOrigemDoContato(null).href).toBe('/contacts')
    expect(resolverOrigemDoContato('toString').href).toBe('/contacts')
    expect(resolverOrigemDoContato('deal', 'd-1').href).toBe('/deals/d-1/cockpit-v2')
    expect(resolverOrigemDoContato('inbox').href).toBe('/inbox')
    expect(semComentarios('features/contacts/detail/ContactDetailPage.tsx')).toContain(
      'resolverOrigemDoContato('
    )
  })
})

describe('o detalhe do contato não afirma o que não sabe', () => {
  it('erro e carregamento não viram "não encontrado" nem "nenhum deal"', () => {
    // Descartar isError faz falha de rede virar afirmação sobre o dado: a pessoa
    // conclui que o contato foi excluído, ou que não há deal nenhum.
    const page = semComentarios('features/contacts/detail/ContactDetailPage.tsx')
    for (const sinal of ['erroNoContato', 'erroNosDeals', 'erroNoHistorico', 'erroNasEmpresas']) {
      expect(page, sinal).toContain(sinal)
    }
    expect(page).toContain('carregandoDeals')
    expect(page).toContain('carregandoHistorico')
  })

  it('editar continua disponível no detalhe', () => {
    // A gaveta tinha esse botão; a mudança pra página o perdeu.
    const page = semComentarios('features/contacts/detail/ContactDetailPage.tsx')
    expect(page).toContain('ContactFormModal')
    expect(page).toContain('useUpdateContact')
  })

  it('a mutation de contato alcança o cache de detalhe', () => {
    // `entityCachesExceptDetail` não cobre `detail(id)`. Sem cancelar e escrever
    // nele, um fetch em voo sobrescreve o otimismo e o detalhe fica no valor
    // velho enquanto a lista já mostra o novo.
    const hook = semComentarios('lib/query/hooks/useContactsQuery.ts')
    const ini = hook.indexOf('export const useUpdateContact')
    const corpo = hook.slice(ini, hook.indexOf('export const useUpdateContactStage'))
    expect(corpo).toMatch(/cancelQueries\(\{\s*queryKey:\s*queryKeys\.contacts\.detail\(id\)/)
    expect(corpo).toMatch(/setQueryData<Contact \| null>\(queryKeys\.contacts\.detail\(id\)/)
    expect(corpo).toMatch(/invalidateQueries\(\{\s*queryKey:\s*queryKeys\.contacts\.detail\(id\)/)
  })
})

describe('a barra de saúde diz de quem é o número', () => {
  const cockpit = semComentarios('features/deals/cockpit/DealCockpitClient.tsx')

  it('nomeia a fonte quando a IA e o campo do deal divergem', () => {
    // Achado no /qa em produção: "saúde do deal 50%" e "probabilidade 0%" na
    // mesma linha, a 14px um do outro. O 50% era a estimativa da IA, o 0% o
    // campo gravado no deal. Dois percentuais que deviam concordar e não
    // concordam, sem dizer de quem é cada um, queimam a confiança nos dois.
    expect(cockpit).toContain('saudeVeioDaIA')
    expect(cockpit).toMatch(/estimativa da IA/)
    expect(cockpit).toMatch(/probabilidade gravada no deal/)
    // A segunda menção só aparece quando os números REALMENTE divergem.
    expect(cockpit).toMatch(/saudeVeioDaIA && \(deal\.probability \?\? 50\) !== health\.score/)
  })

  it('não pinta valor de carregamento com cara de diagnóstico', () => {
    // Enquanto a IA analisa, `health` cai no campo do deal — 0 num deal novo.
    // A barra pintava 0% em vermelho e "alto" aparecia como se fosse o veredito.
    expect(cockpit).toMatch(/aiLoading \? '0%'/)
    expect(cockpit).toMatch(/aiLoading \? '—'/)
    expect(cockpit).toMatch(/aiLoading \? 'analisando…'/)
  })
})

describe('o modal de edição do detalhe não tem campo morto', () => {
  const page = semComentarios('features/contacts/detail/ContactDetailPage.tsx')

  it('o campo empresa faz o que a legenda dele promete', () => {
    // Achado no /qa: o modal abria com "Empresa não vinculada" no campo empresa
    // (texto de estado, não nome), a legenda dizia "Este campo cria a empresa",
    // e salvar ignorava o valor. Controle que parece inteiro e não faz nada.
    expect(page).toContain('createCompany')
    expect(page).toMatch(/companyId,/)
  })

  it('nunca pré-preenche o campo com o texto de estado da tela', () => {
    // `companyName` é o TEXTO exibido e vira "Empresa não vinculada" ou
    // "empresa fora do lote carregado". Pré-preencher com isso criaria uma
    // empresa com esse nome no primeiro salvamento.
    expect(page).toMatch(/companyName: empresaDoContato\?\.name \?\? ''/)
    expect(page).not.toMatch(/companyName: companyName/)
  })
})
