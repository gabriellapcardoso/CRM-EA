/**
 * Guarda do failover nativo de modelo da OpenRouter (2026-09-01).
 *
 * Em 2026-09-01 a OpenRouter removeu do catálogo o modelo que o CRM usava e
 * toda a camada de IA caiu junto — 17 arquivos, incluindo o agente que negocia
 * no WhatsApp e o cron de avaliação de estágios. Um id de modelo era ponto
 * único de falha para o produto inteiro.
 *
 * O conserto é o parâmetro `models` da OpenRouter: uma lista de reserva que ela
 * percorre DENTRO da mesma requisição quando o primário falha. Fica no
 * `extraBody` do factory, então vale pras 17 chamadas de uma vez.
 *
 * Estes testes travam o contrato do lado de cá — que a lista chega montada e na
 * ordem certa. Que a OpenRouter de fato cai pro próximo foi verificado contra a
 * API real, forçando um modelo inexistente (ver CHANGELOG); isso não dá pra
 * afirmar em teste unitário sem bater na rede.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createOpenRouterMock = vi.fn(() => ({ chat: vi.fn((id: string) => ({ modelId: id })) }))

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: (...args: unknown[]) => createOpenRouterMock(...(args as [])),
}))

const { getModel } = await import('./config')
const { AI_DEFAULT_MODELS, AI_FALLBACK_MODELS } = await import('./defaults')

const CHAVE = 'sk-or-v1-fake-para-teste'

/** Config que `createOpenRouter` recebeu na última chamada. */
function ultimaConfig(): { apiKey: string; extraBody?: { models?: string[] } } {
  const call = createOpenRouterMock.mock.calls.at(-1)
  return call?.[0] as never
}

beforeEach(() => {
  createOpenRouterMock.mockClear()
})

describe('failover de modelo — parâmetro `models` da OpenRouter', () => {
  it('manda a lista de reserva junto do modelo primário, na ordem de prioridade', () => {
    // Um só teste: `toEqual` num array já verifica presença E ordem ao mesmo
    // tempo. Existiam dois testes aqui fazendo exatamente esta asserção sob
    // nomes diferentes — reordenar a lista quebraria os dois juntos, então a
    // duplicata não comprava cobertura extra, só ruído. A OpenRouter percorre
    // na ordem dada; reordenar muda qual modelo atende durante um incidente.
    getModel('openrouter', CHAVE, 'deepseek/deepseek-v4-flash-0731')
    expect(ultimaConfig().extraBody?.models).toEqual([...AI_FALLBACK_MODELS])
  })

  it('não repete o primário na lista de reserva', () => {
    // Repetir gastaria uma tentativa no modelo que a OpenRouter acabou de
    // recusar — na prática, uma reserva a menos.
    const primario = AI_FALLBACK_MODELS[0]
    getModel('openrouter', CHAVE, primario)
    expect(ultimaConfig().extraBody?.models).not.toContain(primario)
  })

  it('a rede de segurança também cobre o caminho do fallback de modelo inválido', () => {
    // `ai_model` inválido cai no default (ver config.test.ts). O que este teste
    // trava é que esse caminho NÃO perde a lista de reserva: era justamente o
    // default que estava morto em 2026-09-01.
    getModel('openrouter', CHAVE, 'gemini-2.5-flash')
    expect(ultimaConfig().extraBody?.models?.length).toBeGreaterThan(0)
  })
})

describe('composição da lista de reserva', () => {
  it('tem pelo menos dois modelos', () => {
    expect(AI_FALLBACK_MODELS.length).toBeGreaterThanOrEqual(2)
  })

  it('cobre mais de um fabricante', () => {
    // Dois modelos do mesmo fornecedor caem juntos quando o fornecedor cai, e
    // a lista não teria servido pra nada. O ponto é sobreviver ao provedor
    // inteiro sair do ar, não só a um modelo sumir.
    const todos = [AI_DEFAULT_MODELS.openrouter, ...AI_FALLBACK_MODELS]
    const fabricantes = new Set(todos.map((m) => m.split('/')[0]))
    expect(fabricantes.size).toBeGreaterThanOrEqual(2)
  })

  it('não inclui o modelo removido do catálogo em 2026-09-01', () => {
    expect([...AI_FALLBACK_MODELS]).not.toContain('google/gemini-2.0-flash-001')
  })

  it('todos usam o formato provider/model da OpenRouter', () => {
    for (const m of AI_FALLBACK_MODELS) {
      expect(m).toMatch(/^[\w.-]+\/[\w.:-]+$/)
    }
  })
})

describe('contrato real do SDK — sem o mock do topo do arquivo', () => {
  // Todo teste acima mocka `@openrouter/ai-sdk-provider` pra não bater em rede
  // (ver comentário no topo do arquivo). Isso tem um preço: se a versão
  // instalada do SDK renomear `extraBody`, os testes acima continuam verdes —
  // eles verificam o que ESTE arquivo manda pro mock, não o que o pacote de
  // verdade aceita. `getModel` (lib/ai/config.ts) importa o `createOpenRouter`
  // real e é pego por `tsc` se o campo sumir do tipo, mas isso só roda no
  // typecheck do projeto inteiro — este teste fecha o mesmo buraco de forma
  // isolada, lendo o `.d.ts` do pacote instalado (não o mock), como as outras
  // guardas de "arquivo como texto" deste repo (ver test/cockpitLayout.test.ts).
  // Issue #23, item 4.
  it('OpenRouterProviderSettings ainda declara extraBody como Record<string, unknown>', () => {
    const pacotePath = require.resolve('@openrouter/ai-sdk-provider/package.json')
    const pacote = JSON.parse(readFileSync(pacotePath, 'utf-8')) as { types?: string; typings?: string }
    const tiposRel = pacote.types ?? pacote.typings
    expect(tiposRel, 'pacote sem campo types/typings no package.json — SDK mudou de forma que nem dá pra achar o .d.ts').toBeTruthy()
    const tiposPath = join(dirname(pacotePath), tiposRel as string)
    const dts = readFileSync(tiposPath, 'utf-8')

    const inicio = dts.indexOf('interface OpenRouterProviderSettings')
    expect(inicio, 'OpenRouterProviderSettings sumiu do .d.ts — createOpenRouter mudou de forma').toBeGreaterThan(-1)
    const fim = dts.indexOf('\n}', inicio)
    const bloco = dts.slice(inicio, fim)

    expect(bloco).toMatch(/extraBody\?:\s*Record<string,\s*unknown>/)
  })
})
