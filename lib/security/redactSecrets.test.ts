/**
 * Guarda de `redactSecrets` (issue #23, item 19).
 */
import { describe, expect, it } from 'vitest'
import { redactSecrets } from './redactSecrets'

describe('redactSecrets', () => {
  it('redige chave estilo OpenRouter/OpenAI (sk-...)', () => {
    const texto = 'Invalid API key: sk-or-v1-abc123def456ghi789'
    expect(redactSecrets(texto)).toBe('Invalid API key: [REDACTED]')
  })

  it('redige chave estilo Resend (re_...)', () => {
    const texto = 'chave inválida: re_fake000_teste0000000000000000'
    expect(redactSecrets(texto)).toBe('chave inválida: [REDACTED]')
  })

  it('redige JWT/token Supabase (eyJ...)', () => {
    const texto = 'token expirado: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    expect(redactSecrets(texto)).toBe('token expirado: [REDACTED]')
  })

  it('redige "Bearer <token>" genérico', () => {
    const texto = 'header rejeitado: Bearer abc123def456ghi789jkl'
    expect(redactSecrets(texto)).toBe('header rejeitado: [REDACTED]')
  })

  it('não mexe em texto sem nada parecido com segredo', () => {
    const texto = 'modelo não gerou saída estruturada nem tokens'
    expect(redactSecrets(texto)).toBe(texto)
  })

  it('redige múltiplas ocorrências no mesmo texto', () => {
    const texto = 'tentativa 1 falhou com sk-aaaaaaaaaaaaaaaa; tentativa 2 falhou com sk-bbbbbbbbbbbbbbbb'
    const resultado = redactSecrets(texto)
    expect(resultado).not.toMatch(/sk-[a-z]/i)
    expect((resultado.match(/\[REDACTED\]/g) ?? []).length).toBe(2)
  })

  it('não redige um id de modelo da OpenRouter (não é o formato de chave)', () => {
    // provider/model — não deve ser confundido com re_/sk-/eyJ/Bearer.
    const texto = 'modelo configurado "deepseek/deepseek-v4-flash-0731" não atendeu'
    expect(redactSecrets(texto)).toBe(texto)
  })
})
