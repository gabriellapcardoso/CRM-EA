/**
 * Guarda de `autenticaCron` (issue #23, item 18).
 *
 * `!==` numa string normal compara byte a byte e retorna assim que acha uma
 * diferença — o tempo de resposta vaza quantos caracteres do início bateram.
 * Risco prático baixo aqui (tudo atrás de HTTPS, sem usuário final tentando
 * adivinhar por timing), mas o custo de corrigir é baixo também.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autenticaCron } from './cronAuth'

const SECRET = 'segredo-de-teste-32-caracteres!!'

function req(authHeader: string | null): Request {
  const headers = new Headers()
  if (authHeader !== null) headers.set('Authorization', authHeader)
  return new Request('https://exemplo.test/api/cron/qualquer', { headers })
}

describe('autenticaCron', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('aceita o Bearer token correto', () => {
    expect(autenticaCron(req(`Bearer ${SECRET}`))).toBe(true)
  })

  it('recusa token errado', () => {
    expect(autenticaCron(req('Bearer valor-errado'))).toBe(false)
  })

  it('recusa header ausente', () => {
    expect(autenticaCron(req(null))).toBe(false)
  })

  it('recusa quando CRON_SECRET não está configurado no ambiente', () => {
    vi.stubEnv('CRON_SECRET', '')
    expect(autenticaCron(req(`Bearer ${SECRET}`))).toBe(false)
  })

  it('recusa token de tamanho diferente sem lançar', () => {
    // timingSafeEqual lança em buffers de tamanho diferente — a função
    // precisa checar o length antes, senão um token mais curto/mais longo
    // derruba a rota com 500 em vez de devolver 401.
    expect(() => autenticaCron(req('Bearer curto'))).not.toThrow()
    expect(autenticaCron(req('Bearer curto'))).toBe(false)
  })

  it('recusa prefixo sem "Bearer "', () => {
    expect(autenticaCron(req(SECRET))).toBe(false)
  })
})
