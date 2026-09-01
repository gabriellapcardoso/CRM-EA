/**
 * Testes de GET /api/cron/ai-health (issue #16).
 *
 * Existe porque em 2026-09-01 a OpenRouter removeu do catálogo o modelo que o
 * CRM usava e TODA a camada de IA caiu — 17 arquivos, incluindo o agente que
 * negocia no WhatsApp. Ninguém foi avisado: o problema foi achado por acaso,
 * olhando o console do navegador durante um QA de layout.
 *
 * A regra central é "alerta só na SEGUNDA falha consecutiva", e ela depende de
 * estado no banco porque cada execução do cron é um processo novo. São duas
 * janelas distintas e é fácil confundi-las, então cada uma tem teste próprio:
 *
 * - janela de 20min  -> esta falha é a 2ª consecutiva?
 * - cooldown de 4h   -> já mandamos e-mail recentemente?
 *
 * Guardas:
 * - sem CRON_SECRET correto -> 401 antes de tocar em banco ou IA
 * - IA saudável -> zero linhas gravadas, zero e-mail (96 execuções/dia)
 * - 1ª falha -> grava severity=info, NÃO manda e-mail
 * - 2ª falha na janela -> grava severity=critical E manda e-mail
 * - 2ª falha com critical recente -> grava, mas NÃO repete e-mail (cooldown)
 * - alert_email vazio -> não quebra, e loga alto (foi o bug de 30 dias)
 * - resposta vazia do modelo conta como falha
 * - org sem ai_enabled/sem chave nem entra na consulta
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORG_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6'
const SECRET = 'cron-secret-de-teste'

let orgsResult: { data: unknown; error: unknown }
/**
 * As duas consultas a `security_alerts` são respondidas separadamente porque
 * significam coisas diferentes, e tratá-las como uma só esconderia bug:
 * a da JANELA (20min) diz se esta é a 2ª falha; a do COOLDOWN (4h) diz se já
 * mandamos e-mail. Distinguimos pelo filtro `severity`, que só a de cooldown usa.
 */
let janelaResult: { data: unknown }
let cooldownResult: { data: unknown }
let insertSpy: ReturnType<typeof vi.fn>
let sendEmailSpy: ReturnType<typeof vi.fn>
let generateTextMock: ReturnType<typeof vi.fn>
let getOrgAIConfigMock: ReturnType<typeof vi.fn>
/** Filtros aplicados na consulta a security_alerts, pra distinguir janela x cooldown. */
let lastAlertFilters: Record<string, unknown>

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendEmailSpy(...args) }
  },
}))

vi.mock('@/lib/ai/agent/agent.service', () => ({
  getOrgAIConfig: (...args: unknown[]) => getOrgAIConfigMock(...args),
}))

vi.mock('@/lib/ai/config', () => ({
  getModel: vi.fn(() => ({ modelId: 'fake/model' })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: () => buildSupabase(),
}))

function buildSupabase() {
  return {
    from: (tabela: string) => {
      if (tabela === 'organization_settings') {
        const qb: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn(async () => orgsResult),
        }
        return qb
      }
      // security_alerts — filtros por query, não globais: cada `.from()` é uma
      // consulta nova e precisa ser respondida conforme os próprios filtros.
      const filtros: Record<string, unknown> = {}
      const qb: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: unknown) => {
          filtros[col] = val
          lastAlertFilters[col] = val
          return qb
        }),
        gte: vi.fn((col: string, val: unknown) => {
          filtros[col] = val
          lastAlertFilters[col] = val
          return qb
        }),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () =>
          filtros.severity ? cooldownResult : janelaResult,
        ),
        insert: (row: unknown) => insertSpy(row),
      }
      return qb
    },
  }
}

import { GET } from '@/app/api/cron/ai-health/route'

/** Requisição com o header de cron correto. */
function req(secret = SECRET) {
  return new Request('https://exemplo.test/api/cron/ai-health', {
    headers: { Authorization: `Bearer ${secret}` },
  })
}

/** Última linha passada para `insert`. */
function linhaGravada(): Record<string, unknown> {
  return insertSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET)
  vi.stubEnv('RESEND_API_KEY', 'chave-resend-de-teste')
  orgsResult = { data: [{ organization_id: ORG_ID, alert_email: 'destino@exemplo.test' }], error: null }
  janelaResult = { data: null }
  cooldownResult = { data: null }
  lastAlertFilters = {}
  insertSpy = vi.fn(async () => ({ error: null }))
  sendEmailSpy = vi.fn(async () => ({ data: {}, error: null }))
  generateTextMock = vi.fn(async () => ({ text: 'ok' }))
  getOrgAIConfigMock = vi.fn(async () => ({ provider: 'openrouter', apiKey: 'sk-or-fake', model: 'x/y' }))
})

describe('autenticação', () => {
  it('recusa sem o CRON_SECRET correto, antes de tocar em banco ou IA', async () => {
    const res = await GET(req('secret-errado'))
    expect(res.status).toBe(401)
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('recusa quando CRON_SECRET não está configurado no ambiente', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(req())).status).toBe(401)
  })
})

describe('IA saudável', () => {
  it('não grava nada e não manda e-mail', async () => {
    // 96 execuções por dia: se cada sucesso gravasse, a tabela de alertas viraria
    // log de rotina e o alerta real se perderia no meio.
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ checked: 1, degraded: 0, alerted: 0 })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(sendEmailSpy).not.toHaveBeenCalled()
  })
})

describe('primeira falha', () => {
  beforeEach(() => {
    generateTextMock = vi.fn(async () => {
      throw new Error('No endpoints found for modelo/removido')
    })
  })

  it('grava severity=info e NÃO manda e-mail', async () => {
    // Uma falha isolada pode ser soluço de rede. Avisar aqui geraria alarme falso.
    await GET(req())
    expect(linhaGravada()).toMatchObject({ alert_type: 'ai_health_degraded', severity: 'info' })
    expect(sendEmailSpy).not.toHaveBeenCalled()
  })

  it('registra o motivo real da falha, não uma mensagem genérica', async () => {
    // Sem o motivo, o e-mail da 2ª falha não diz o que consertar.
    await GET(req())
    const detalhes = linhaGravada().details as Record<string, unknown>
    expect(String(detalhes.motivo)).toContain('No endpoints found')
  })
})

describe('segunda falha consecutiva', () => {
  beforeEach(() => {
    generateTextMock = vi.fn(async () => {
      throw new Error('402 insufficient credits')
    })
    janelaResult = { data: { id: 'falha-anterior' } } // já houve falha na janela
    cooldownResult = { data: null } // nenhum e-mail recente
  })

  it('grava severity=critical e manda o e-mail', async () => {
    const res = await GET(req())
    expect(linhaGravada()).toMatchObject({ severity: 'critical' })
    expect(sendEmailSpy).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ degraded: 1, alerted: 1 })
  })

  it('manda para o endereço de alert_email da org', async () => {
    await GET(req())
    expect(sendEmailSpy.mock.calls[0][0]).toMatchObject({ to: 'destino@exemplo.test' })
  })

  it('consulta o cooldown de 4h por severity=critical', async () => {
    // Se consultasse sem filtrar severity, o `info` da 1ª falha contaria como
    // "e-mail recente" e silenciaria justamente o primeiro alerta de verdade.
    await GET(req())
    expect(lastAlertFilters.severity).toBe('critical')
  })

  it('não manda e-mail quando já houve um critical no cooldown', async () => {
    // Uma IA fora do ar a noite toda renderia 90+ e-mails sem isto.
    // O registro continua acontecendo: só o e-mail é limitado.
    cooldownResult = { data: { id: 'email-recente' } }
    await GET(req())
    expect(sendEmailSpy).not.toHaveBeenCalled()
    expect(insertSpy).toHaveBeenCalled()
    expect(linhaGravada()).toMatchObject({ severity: 'critical' })
  })
})

describe('alert_email vazio', () => {
  beforeEach(() => {
    orgsResult = { data: [{ organization_id: ORG_ID, alert_email: null }], error: null }
    generateTextMock = vi.fn(async () => {
      throw new Error('falhou')
    })
    janelaResult = { data: { id: 'falha-anterior' } }
    cooldownResult = { data: null }
  })

  it('não quebra, e grava o alerta mesmo assim', async () => {
    // Esse é o bug de 30 dias: 4 alertas de canal WhatsApp gravados e nenhum
    // e-mail enviado, porque alert_email estava NULL e o código seguia calado.
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(insertSpy).toHaveBeenCalled()
    expect(sendEmailSpy).not.toHaveBeenCalled()
  })

  it('loga em console.error para não falhar em silêncio', async () => {
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await GET(req())
    const mensagens = erroSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(mensagens).toMatch(/alert_email/i)
    erroSpy.mockRestore()
  })
})

describe('o que conta como falha', () => {
  it('texto vazio COM tokens gerados NÃO é falha (modelo de raciocínio)', async () => {
    // Bug real, pego no teste ao vivo: com maxOutputTokens baixo o DeepSeek v4
    // gastava o orçamento no raciocínio e devolvia texto vazio, e o check
    // acusava "IA fora do ar" com a IA saudável. Falso positivo em monitor
    // ensina a ignorar o alerta — é pior que não ter monitor.
    generateTextMock = vi.fn(async () => ({ text: '   ', usage: { totalTokens: 40 } }))
    await GET(req())
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('sem texto E sem tokens conta como falha', async () => {
    // Aí sim não houve resposta nenhuma.
    generateTextMock = vi.fn(async () => ({ text: '', usage: { totalTokens: 0 } }))
    await GET(req())
    expect(insertSpy).toHaveBeenCalled()
  })

  it('config nula da org conta como falha, não como sucesso silencioso', async () => {
    getOrgAIConfigMock = vi.fn(async () => null)
    await GET(req())
    expect(linhaGravada()).toMatchObject({ severity: 'info' })
  })

  it('teor diferente de "ok" NÃO conta como falha', async () => {
    // Checar o conteúdo transformaria variação normal de modelo em alerta falso.
    generateTextMock = vi.fn(async () => ({ text: 'Certo!' }))
    await GET(req())
    expect(insertSpy).not.toHaveBeenCalled()
  })
})
