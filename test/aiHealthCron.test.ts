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
let heartbeatSpy: ReturnType<typeof vi.fn>
let sendEmailSpy: ReturnType<typeof vi.fn>
let generateTextMock: ReturnType<typeof vi.fn>
let getOrgAIConfigMock: ReturnType<typeof vi.fn>
/** Checagem do caminho de RAG (issue #34, item 5). Só roda pra org com ai_google_key. */
let verificarRAGMock: ReturnType<typeof vi.fn>
/** Filtros aplicados na consulta a security_alerts, pra distinguir janela x cooldown. */
let lastAlertFilters: Record<string, unknown>
/**
 * Snapshot dos filtros de CADA consulta a `security_alerts`, na ordem em que
 * completam. A janela sempre roda primeiro; o cooldown (se rodar) é o segundo.
 * `lastAlertFilters` acima é um objeto ÚNICO mutado pelas duas consultas — a
 * chave `created_at` do cooldown sobrescreve a da janela, então não dava pra
 * usá-lo pra afirmar o corte de 20min sem essa lista separada.
 */
let alertQueries: Array<Record<string, unknown>>
/** Chamadas de filtro na consulta a `organization_settings` (issue #23, item 4). */
let orgFilterCalls: Array<{ method: string; args: unknown[] }>
/** Resposta da consulta a `organizations` que filtra orgs excluídas (issue #23, item 7). */
let deletedOrgsResult: { data: unknown; error: unknown }
/** Quantas vezes `.from('organizations')` foi chamado — pra provar que não roda com lista vazia. */
let organizationsQueryCount: number

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  // `Output` precisa existir: sem ele `Output.object()` lança TypeError, o
  // catch de checarIA transforma isso em "falha", e todo teste de caminho
  // saudável passa a acusar degradação — falha no mock virando falso vermelho.
  Output: { object: (cfg: unknown) => cfg },
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

vi.mock('@/lib/ai/messaging/file-search', () => ({
  verificarCaminhoRAG: (...args: unknown[]) => verificarRAGMock(...args),
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
          eq: vi.fn((...args: unknown[]) => {
            orgFilterCalls.push({ method: 'eq', args })
            return qb
          }),
          not: vi.fn(async (...args: unknown[]) => {
            orgFilterCalls.push({ method: 'not', args })
            return orgsResult
          }),
        }
        return qb
      }
      if (tabela === 'organizations') {
        organizationsQueryCount++
        const qb: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          not: vi.fn(async () => deletedOrgsResult),
        }
        return qb
      }
      if (tabela === 'cron_heartbeats') {
        return { upsert: (row: unknown) => heartbeatSpy(row) }
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
        contains: vi.fn((col: string, val: unknown) => {
          filtros[col] = val
          lastAlertFilters[col] = val
          return qb
        }),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => {
          alertQueries.push({ ...filtros })
          // O cooldown agora filtra por `details.email_enviado`, não por severity.
          return filtros.details ? cooldownResult : janelaResult
        }),
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
  deletedOrgsResult = { data: [], error: null }
  organizationsQueryCount = 0
  janelaResult = { data: null }
  cooldownResult = { data: null }
  lastAlertFilters = {}
  alertQueries = []
  orgFilterCalls = []
  insertSpy = vi.fn(async () => ({ error: null }))
  heartbeatSpy = vi.fn(async () => ({ error: null }))
  sendEmailSpy = vi.fn(async () => ({ data: {}, error: null }))
  generateTextMock = vi.fn(async () => ({
    output: { ok: true },
    usage: { totalTokens: 12 },
    response: { modelId: 'x/y' }, // igual ao model do getOrgAIConfigMock: sem fallback
  }))
  getOrgAIConfigMock = vi.fn(async () => ({ provider: 'openrouter', apiKey: 'sk-or-fake', model: 'x/y' }))
  verificarRAGMock = vi.fn(async () => ({ ok: true }))
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

describe('consulta de orgs elegíveis — só quem ligou a IA e tem chave', () => {
  // Cabeçalho deste arquivo promete "org sem ai_enabled/sem chave nem entra na
  // consulta" desde a criação, mas nada verificava os filtros de verdade — o
  // mock aceitava qualquer `.eq()`/`.not()` sem registrar coluna ou valor.
  // Issue #23, item 4.
  it('filtra por ai_enabled=true', async () => {
    await GET(req())
    expect(orgFilterCalls).toContainEqual({ method: 'eq', args: ['ai_enabled', true] })
  })

  it('filtra por chave da OpenRouter configurada', async () => {
    await GET(req())
    expect(orgFilterCalls).toContainEqual({ method: 'not', args: ['ai_openrouter_key', 'is', null] })
  })
})

describe('org excluída (deleted_at) não é checada', () => {
  // organization_settings não tem deleted_at próprio — uma org excluída
  // continua com IA ligada e chave configurada, e entraria na consulta
  // principal sem este filtro: gastando crédito de IA paga e recebendo
  // e-mail por uma org que não existe mais pro produto. Issue #23, item 7.
  it('não checa (nem grava IA) org marcada como excluída', async () => {
    deletedOrgsResult = { data: [{ id: ORG_ID }], error: null }
    await GET(req())
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('checked: 0 quando a única org candidata está excluída', async () => {
    deletedOrgsResult = { data: [{ id: ORG_ID }], error: null }
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ checked: 0 })
  })

  it('continua checando a org quando ela NÃO está na lista de excluídas', async () => {
    deletedOrgsResult = { data: [{ id: 'outra-org-excluida-qualquer' }], error: null }
    const res = await GET(req())
    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ checked: 1 })
  })

  it('erro ao consultar organizations não impede checar as orgs (falha aberta, não fechada)', async () => {
    deletedOrgsResult = { data: null, error: { message: 'timeout' } }
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req())
    // Um erro na consulta AUXILIAR de exclusão não pode derrubar a checagem
    // de TODAS as orgs — inclusive as ativas — por conta de uma query que
    // só existe pra filtrar fora um caso raro.
    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ checked: 1 })
    erroSpy.mockRestore()
  })

  it('não consulta organizations quando não há org candidata nenhuma', async () => {
    orgsResult = { data: [], error: null }
    await GET(req())
    // Consulta auxiliar desnecessária com lista vazia seria round-trip
    // de banco pra nada.
    expect(organizationsQueryCount).toBe(0)
  })
})

describe('nenhuma org elegível — checked: 0 não é sucesso silencioso', () => {
  // Coluna renomeada, `ai_enabled` desligado em massa ou chave migrada de
  // lugar deixariam a consulta acima sem casar nada — e a rota responderia
  // 200 com `checked: 0`, indistinguível de "não há nada pra checar hoje".
  it('devolve checked: 0 e loga alto — o monitor está inerte', async () => {
    orgsResult = { data: [], error: null }
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ checked: 0, degraded: 0, alerted: 0 })
    const mensagens = erroSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(mensagens).toMatch(/nenhuma org/i)
    erroSpy.mockRestore()
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

describe('concorrência entre orgs tem limite (issue #23, item 17)', () => {
  // Sem limite, o número de chamadas simultâneas à OpenRouter cresce junto
  // com o número de orgs — rate limit e contenção no pool de conexão viram
  // backoff que acumula tempo, e numa rota com maxDuration fixo o lote pode
  // ser cortado no meio. Este teste mede a concorrência de verdade, não só
  // confirma que todas as orgs terminam (o que aconteceria mesmo sem limite).
  it('nunca checa mais orgs ao mesmo tempo do que o limite configurado', async () => {
    const TOTAL_ORGS = 15
    orgsResult = {
      data: Array.from({ length: TOTAL_ORGS }, (_, i) => ({
        organization_id: `org-${i}`,
        alert_email: 'destino@exemplo.test',
      })),
      error: null,
    }

    let emVoo = 0
    let picoDeConcorrencia = 0
    generateTextMock = vi.fn(async () => {
      emVoo++
      picoDeConcorrencia = Math.max(picoDeConcorrencia, emVoo)
      await new Promise((resolve) => setTimeout(resolve, 5))
      emVoo--
      return { output: { ok: true }, usage: { totalTokens: 12 }, response: { modelId: 'x/y' } }
    })

    const res = await GET(req())
    expect(await res.json()).toMatchObject({ checked: TOTAL_ORGS })
    // CONCORRENCIA_MAXIMA no route.ts é 10 — se o número aqui não bater com
    // lá, é porque um dos dois mudou sem o outro. O teste importa o
    // comportamento observável (o pico real), não a constante em si.
    expect(picoDeConcorrencia).toBeLessThanOrEqual(10)
    expect(picoDeConcorrencia).toBeGreaterThan(1) // prova que roda em paralelo, não sequencial
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

  it('redige chave que o provider ecoou na mensagem de erro antes de gravar (issue #23, item 19)', async () => {
    generateTextMock = vi.fn(async () => {
      throw new Error('Invalid API key: sk-or-v1-abc123def456ghi789')
    })
    await GET(req())
    const detalhes = linhaGravada().details as Record<string, unknown>
    expect(String(detalhes.motivo)).not.toMatch(/sk-or-v1-[a-z0-9]/i)
    expect(String(detalhes.motivo)).toContain('[REDACTED]')
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
    // A versão anterior filtrava `severity='critical'` e gravava um `critical`
    // a cada execução: a janela de 4h se auto-alimentava e nunca expirava, então
    // saía UM e-mail por incidente e nunca mais. Observado em produção.
    await GET(req())
    expect(lastAlertFilters.details).toEqual({ email_enviado: true })
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
  it('saída presente com tokens NÃO é falha (modelo de raciocínio)', async () => {
    // Bug real, pego no teste ao vivo: com maxOutputTokens baixo o DeepSeek v4
    // gastava o orçamento no raciocínio e devolvia texto vazio, e o check
    // acusava "IA fora do ar" com a IA saudável. Falso positivo em monitor
    // ensina a ignorar o alerta — é pior que não ter monitor.
    generateTextMock = vi.fn(async () => ({ output: { ok: true }, usage: { totalTokens: 40 }, response: { modelId: 'x/y' } }))
    await GET(req())
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('sem saída E sem tokens conta como falha', async () => {
    // Aí sim não houve resposta nenhuma.
    generateTextMock = vi.fn(async () => ({ output: undefined, usage: { totalTokens: 0 }, response: { modelId: 'x/y' } }))
    await GET(req())
    expect(insertSpy).toHaveBeenCalled()
  })

  it('config nula da org conta como falha, não como sucesso silencioso', async () => {
    getOrgAIConfigMock = vi.fn(async () => null)
    await GET(req())
    expect(linhaGravada()).toMatchObject({ severity: 'info' })
  })

  it('teor da resposta NÃO conta como falha', async () => {
    // Checar o conteúdo transformaria variação normal de modelo em alerta falso.
    generateTextMock = vi.fn(async () => ({ output: { ok: false }, usage: { totalTokens: 9 }, response: { modelId: 'x/y' } }))
    await GET(req())
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

describe('failover silencioso — o P0 que motivou a issue #20', () => {
  beforeEach(() => {
    // A OpenRouter atendeu, mas com OUTRO modelo: o configurado sumiu do
    // catálogo e a lista de reserva resgatou a chamada.
    generateTextMock = vi.fn(async () => ({
      output: { ok: true },
      usage: { totalTokens: 12 },
      response: { modelId: 'deepseek/deepseek-v4-flash' },
    }))
    getOrgAIConfigMock = vi.fn(async () => ({
      provider: 'openrouter',
      apiKey: 'sk-or-fake',
      model: 'google/gemini-2.0-flash-001', // o modelo removido do catálogo
    }))
  })

  it('detecta que a resposta veio de um modelo diferente do configurado', async () => {
    // Antes desta guarda o check devolvia `degraded: 0` neste cenário — provado
    // em produção em 2026-09-01. O failover mantinha a aplicação de pé E
    // escondia que a configuração da org estava morta, então o monitor era cego
    // justamente para o incidente que motivou sua construção.
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ degraded: 1 })
    expect(insertSpy).toHaveBeenCalled()
  })

  it('nomeia os dois modelos no registro, senão não dá pra agir', async () => {
    await GET(req())
    const motivo = String((linhaGravada().details as Record<string, unknown>).motivo)
    expect(motivo).toContain('google/gemini-2.0-flash-001')
    expect(motivo).toContain('deepseek/deepseek-v4-flash')
  })

  it('marca como degradado, não como queda: a aplicação continua de pé', async () => {
    await GET(req())
    expect((linhaGravada().details as Record<string, unknown>).degradado).toBe(true)
    expect(String(linhaGravada().title)).toMatch(/reserva/i)
  })
})

describe('cooldown mede e-mail enviado, não linha gravada', () => {
  beforeEach(() => {
    generateTextMock = vi.fn(async () => {
      throw new Error('402 insufficient credits')
    })
    janelaResult = { data: { id: 'falha-anterior' } }
    cooldownResult = { data: null }
  })

  it('grava email_enviado=true quando o e-mail sai', async () => {
    // É este campo que a próxima execução consulta. A versão anterior procurava
    // `severity='critical'` e gravava um `critical` a cada execução: a janela de
    // 4h se auto-alimentava e nunca expirava, então saía UM e-mail por incidente
    // e nunca mais.
    await GET(req())
    expect((linhaGravada().details as Record<string, unknown>).email_enviado).toBe(true)
  })

  it('grava email_enviado=false quando o Resend recusa', async () => {
    // `resend.emails.send` não lança: devolve `{ error }`. Antes isso era
    // contado como entrega.
    sendEmailSpy = vi.fn(async () => ({ data: null, error: { message: 'domain not verified' } }))
    const res = await GET(req())
    expect((linhaGravada().details as Record<string, unknown>).email_enviado).toBe(false)
    expect(await res.json()).toMatchObject({ alerted: 0 })
  })

  it('grava email_enviado=false quando não há destinatário', async () => {
    orgsResult = { data: [{ organization_id: ORG_ID, alert_email: null }], error: null }
    await GET(req())
    expect((linhaGravada().details as Record<string, unknown>).email_enviado).toBe(false)
  })
})

describe('erros de banco não podem virar silêncio', () => {
  beforeEach(() => {
    generateTextMock = vi.fn(async () => {
      throw new Error('falhou')
    })
  })

  it('erro ao gravar o alerta é contado e devolvido, não engolido', async () => {
    // Sem o registro, a execução seguinte se acha a primeira falha e o e-mail
    // nunca sai. Era invisível: a rota respondia 200 igualzinho.
    insertSpy = vi.fn(async () => ({ error: { message: 'insert failed' } }))
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ errosBanco: 1 })
    expect(erroSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/primeira falha/i)
    erroSpy.mockRestore()
  })
})

describe('janela de 20min é um valor distinto do cooldown de 4h', () => {
  // O cabeçalho promete guardar a janela de 20min desde a criação do arquivo,
  // mas nenhum teste checava o VALOR do corte — só simulava "já houve falha"
  // via `janelaResult`. Trocar `CONSECUTIVE_WINDOW_MS` por qualquer outro
  // número passava batido. `alertQueries[0]` é sempre a consulta da janela
  // (roda pra toda falha); `alertQueries[1]`, quando existe, é o cooldown.
  // Issue #23, item 4.
  beforeEach(() => {
    generateTextMock = vi.fn(async () => {
      throw new Error('falhou')
    })
  })

  it('o corte da consulta da janela é ~20 minutos atrás, não outro valor', async () => {
    const antes = Date.now()
    await GET(req())
    const depois = Date.now()
    const corteJanela = alertQueries[0]?.created_at as string
    expect(corteJanela).toBeTruthy()
    const idadeMs = antes - new Date(corteJanela).getTime()
    const VINTE_MIN_MS = 20 * 60 * 1000
    const folga = depois - antes + 1000
    expect(idadeMs).toBeGreaterThanOrEqual(VINTE_MIN_MS - 1000)
    expect(idadeMs).toBeLessThanOrEqual(VINTE_MIN_MS + folga)
  })

  it('o corte do cooldown (4h) é bem mais antigo que o da janela (20min)', async () => {
    janelaResult = { data: { id: 'falha-anterior' } } // 2ª falha: dispara a consulta de cooldown também
    cooldownResult = { data: null }
    await GET(req())
    const corteJanela = new Date(alertQueries[0].created_at as string).getTime()
    const corteCooldown = new Date(alertQueries[1].created_at as string).getTime()
    // Se os dois cortes fossem o mesmo valor (bug de copiar/colar a constante
    // errada), esta comparação não distinguiria os dois cenários.
    expect(corteCooldown).toBeLessThan(corteJanela)
  })
})

describe('caminho de RAG — segundo caminho de IA, chave e API separadas', () => {
  // ai_google_key e a API nativa do Google não são exercitadas por nada no
  // check de chat. Chave revogada ou cota estourada ali é a MESMA classe do
  // incidente de 2026-09-01, num caminho que ninguém vigiava. Issue #34, item 5.

  it('org SEM ai_google_key não dispara checagem de RAG', async () => {
    // Org sem RAG configurado não é falha — é ausência de configuração, mesma
    // regra do filtro de orgs elegíveis. Cobrar chamada aqui gastaria cota
    // Google de quem nem usa RAG.
    await GET(req())
    expect(verificarRAGMock).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('org COM ai_google_key e RAG saudável não grava nada', async () => {
    getOrgAIConfigMock = vi.fn(async () => ({
      provider: 'openrouter',
      apiKey: 'sk-or-fake',
      model: 'x/y',
      ragApiKey: 'chave-google-fake',
    }))
    await GET(req())
    expect(verificarRAGMock).toHaveBeenCalledTimes(1)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('RAG quebrado com chat saudável ainda conta como falha e grava o motivo', async () => {
    getOrgAIConfigMock = vi.fn(async () => ({
      provider: 'openrouter',
      apiKey: 'sk-or-fake',
      model: 'x/y',
      ragApiKey: 'chave-google-fake',
    }))
    verificarRAGMock = vi.fn(async () => ({
      ok: false,
      motivo: 'RAG (Google File Search) falhou: API key not valid',
    }))
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ degraded: 1 })
    expect(String((linhaGravada().details as Record<string, unknown>).motivo)).toContain('RAG')
  })

  it('chat quebrado NÃO chega a checar RAG — o motivo tem que falar da falha maior', async () => {
    // Se o chat caiu, esse é o problema. Reportar RAG no lugar mandaria a
    // operadora consertar a coisa errada durante um incidente.
    getOrgAIConfigMock = vi.fn(async () => ({
      provider: 'openrouter',
      apiKey: 'sk-or-fake',
      model: 'x/y',
      ragApiKey: 'chave-google-fake',
    }))
    generateTextMock = vi.fn(async () => {
      throw new Error('402 insufficient credits')
    })
    await GET(req())
    expect(verificarRAGMock).not.toHaveBeenCalled()
    expect(String((linhaGravada().details as Record<string, unknown>).motivo)).toContain('402')
  })
})

describe('heartbeat', () => {
  it('grava em toda execução, inclusive quando está tudo saudável', async () => {
    // Sem heartbeat, "cron desagendado" e "IA saudável" produzem o mesmo estado
    // observável: nenhuma linha, nenhum e-mail. Quem observa a idade dele é o
    // watchdog em pg_cron, que roda dentro do banco.
    await GET(req())
    expect(heartbeatSpy).toHaveBeenCalledTimes(1)
    expect(heartbeatSpy.mock.calls[0][0]).toMatchObject({ job_name: 'ai-health', last_status: 'ok' })
  })

  it('reporta status degradado quando houve erro de banco', async () => {
    generateTextMock = vi.fn(async () => {
      throw new Error('falhou')
    })
    insertSpy = vi.fn(async () => ({ error: { message: 'boom' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await GET(req())
    expect(heartbeatSpy.mock.calls[0][0]).toMatchObject({ last_status: 'degraded' })
    vi.restoreAllMocks()
  })
})
