/**
 * Guarda do fallback de modelo da OpenRouter (2026-09-01).
 *
 * Contexto: `organization_settings.ai_model` da org estava em
 * `'gemini-2.5-flash'` — formato nativo do Google, sem a barra que a OpenRouter
 * exige. `getModel` descartava esse valor em silêncio e caía no default. O CRM
 * rodou meses ignorando a configuração escolhida na tela de settings, sem um
 * único aviso, e isso só apareceu quando a OpenRouter removeu do catálogo o
 * modelo que era o default: toda a camada de IA passou a dar 404 de uma vez
 * (agente do WhatsApp, análise de deal, briefing, cron de estágios).
 *
 * O fallback em si está certo — é rede de segurança. O que estava errado era ele
 * ser mudo. Estes testes travam as duas metades: o fallback continua existindo,
 * e continua avisando quando dispara.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getModel } from './config'
import { AI_DEFAULT_MODELS } from './defaults'

const CHAVE = 'sk-or-v1-fake-para-teste'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Captura o `console.warn` emitido durante a chamada. */
function warnsDe(fn: () => void): string[] {
  const avisos: string[] = []
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    avisos.push(args.map(String).join(' '))
  })
  fn()
  return avisos
}

describe('getModel — validação do id de modelo', () => {
  it('exige a API key', () => {
    expect(() => getModel('openrouter', '', 'deepseek/deepseek-v4-flash')).toThrow(/API Key/i)
  })

  it('aceita o formato provider/model sem avisar', () => {
    const avisos = warnsDe(() => getModel('openrouter', CHAVE, 'deepseek/deepseek-v4-flash'))
    expect(avisos).toHaveLength(0)
  })

  it.each([
    ['gemini-2.5-flash', 'formato nativo do Google — foi o valor real que quebrou'],
    ['gpt-4o', 'sem provider'],
    ['barra/faltando/demais/', 'termina em barra'],
  ])('avisa alto quando descarta %s (%s)', (modelIdInvalido) => {
    const avisos = warnsDe(() => getModel('openrouter', CHAVE, modelIdInvalido))
    expect(avisos).toHaveLength(1)
    // O aviso tem que nomear o valor rejeitado e dizer que a config foi ignorada,
    // senão não serve pra ninguém achar a causa depois.
    expect(avisos[0]).toContain(modelIdInvalido)
    expect(avisos[0]).toMatch(/IGNORADO/)
    expect(avisos[0]).toMatch(/organization_settings\.ai_model/)
  })

  it('não avisa quando o modelo é vazio (org nova, nunca configurada)', () => {
    // Vazio é ausência de config, não config errada: o default é o comportamento
    // esperado ali e não há nada pra alguém corrigir.
    const avisos = warnsDe(() => getModel('openrouter', CHAVE, ''))
    expect(avisos).toHaveLength(0)
  })
})

describe('modelo default', () => {
  it('está no formato provider/model que a OpenRouter exige', () => {
    // Se o próprio default não passasse na validação, o fallback cairia em si
    // mesmo e a mensagem de erro não faria sentido nenhum.
    expect(AI_DEFAULT_MODELS.openrouter).toMatch(/^[\w.-]+\/[\w.:-]+$/)
  })

  it('não é o google/gemini-2.0-flash-001, removido do catálogo da OpenRouter', () => {
    // 404 "No endpoints found for google/gemini-2.0-flash-001", 2026-09-01.
    expect(AI_DEFAULT_MODELS.openrouter).not.toBe('google/gemini-2.0-flash-001')
  })
})
