/**
 * Guarda do fallback de análise de IA (issue #23, item 2).
 *
 * `probabilityScore: deal.probability || 50` no catch fabricava um número
 * como se fosse análise real durante queda da IA — e o `||` ainda convertia
 * probability real de 0 em 50. O cockpit usava esse número direto no bloco
 * "risco do deal" (`saúde X%`), que é o que a operadora olha primeiro.
 *
 * `buildFailureAnalysis` foi extraída do `queryFn` pra este teste não
 * precisar montar `useQuery`/React — o que importa é a forma do objeto de
 * fallback, não o ciclo de vida da query.
 */
import { describe, expect, it } from 'vitest'
import { buildFailureAnalysis, describeAIError } from './useAIDealAnalysis'
import { AITaskClientError } from '@/lib/ai/tasksClient'

describe('buildFailureAnalysis — nunca fabrica probabilityScore', () => {
  it('probabilityScore vem undefined num erro genérico', () => {
    const analise = buildFailureAnalysis(new Error('network fail'))
    expect(analise.probabilityScore).toBeUndefined()
  })

  it('probabilityScore vem undefined mesmo com AITaskClientError', () => {
    const analise = buildFailureAnalysis(new AITaskClientError(500, 'INTERNAL_ERROR', 'falhou'))
    expect(analise.probabilityScore).toBeUndefined()
  })

  it('preserva o errorCode de um AITaskClientError', () => {
    const analise = buildFailureAnalysis(new AITaskClientError(403, 'AI_FEATURE_DISABLED', 'desativado'))
    expect(analise.errorCode).toBe('AI_FEATURE_DISABLED')
  })

  it('errorCode vem undefined quando o erro não é um AITaskClientError', () => {
    const analise = buildFailureAnalysis(new Error('network fail'))
    expect(analise.errorCode).toBeUndefined()
  })

  it('sempre marca o error como presente — é o sinal que o cockpit usa pra não tratar isto como análise real', () => {
    const analise = buildFailureAnalysis(new Error('qualquer coisa'))
    expect(analise.error).toBeTruthy()
  })
})

describe('describeAIError — cada código de erro tem texto próprio', () => {
  it.each([
    ['AI_DISABLED', /desativad/i],
    ['AI_FEATURE_DISABLED', /desativad/i],
    ['AI_KEY_NOT_CONFIGURED', /config/i],
    ['UNAUTHORIZED', /sessão/i],
  ])('%s produz texto que menciona o motivo certo', (codigo, esperado) => {
    expect(describeAIError(codigo)).toMatch(esperado)
  })

  it('nenhum dos códigos de config/sessão diz "fora do ar"', () => {
    const codigosNaoQueda = ['AI_DISABLED', 'AI_FEATURE_DISABLED', 'AI_KEY_NOT_CONFIGURED', 'UNAUTHORIZED']
    for (const codigo of codigosNaoQueda) {
      expect(describeAIError(codigo)).not.toMatch(/fora do ar/i)
    }
  })
})
