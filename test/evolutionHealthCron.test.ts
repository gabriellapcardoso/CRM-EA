/**
 * Testes de integração para o cron de health-check da sessão Evolution (T4).
 *
 * GET /api/cron/evolution-health
 *
 * Verifica auth por CRON_SECRET, que só alerta canais realmente
 * desconectados (não os desconectados de propósito), respeita o cooldown
 * de 4h entre alertas do mesmo canal, grava em security_alerts e dispara
 * e-mail via Resend quando há alert_email configurado.
 *
 * A partir de 2026-09-03 cobre também o segundo check, que é a razão de o
 * primeiro ter reportado verde por 5 semanas seguidas enquanto o WhatsApp da
 * aaagência não entregava nada: sessão `open` com webhook desabilitado. Um
 * cron que só pergunta "está conectado?" responde "sim" o incidente inteiro.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORG_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6'
const CHANNEL_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-a1b2c3d4e5f6'
const CRON_SECRET = 'test-cron-secret'

let channelsResult: { data: unknown[]; error: unknown }
let recentAlertResult: { data: unknown }
let orgSettingsResult: { data: unknown }
let insertSpy: ReturnType<typeof vi.fn>
let getChannelStatusMock: ReturnType<typeof vi.fn>
let lerWebhookMock: ReturnType<typeof vi.fn>
let resendSendMock: ReturnType<typeof vi.fn>
let fromSpy: ReturnType<typeof vi.fn>
let heartbeatSpy: ReturnType<typeof vi.fn>

function chainable(resolveValue: unknown) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'is', 'contains', 'gte', 'limit']
  for (const m of methods) {
    builder[m] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn(async () => resolveValue)
  // Permite `await supabase.from(...).select().eq()...` sem `.maybeSingle()` (ex.: messaging_channels)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(resolve)
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: vi.fn(() => ({
    from: (table: string) => fromSpy(table),
  })),
}))

vi.mock('@/lib/messaging', () => ({
  getChannelRouter: vi.fn(() => ({
    getChannelStatus: getChannelStatusMock,
  })),
}))

vi.mock('@/lib/messaging/arm-channel-webhook', () => ({
  lerWebhookDoCanal: (...args: unknown[]) => lerWebhookMock(...args),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => resendSendMock(...args) }
  },
}))

import { GET } from '@/app/api/cron/evolution-health/route'

async function callGet(): Promise<Response> {
  const req = new Request('http://localhost/api/cron/evolution-health', {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  })
  return GET(req as any)
}

describe('GET /api/cron/evolution-health', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET
    process.env.RESEND_API_KEY = 'test-resend-key'
    process.env.ALERT_EMAIL_FROM = 'alertas@aaagencia.com.br'

    channelsResult = { data: [], error: null }
    recentAlertResult = { data: null }
    orgSettingsResult = { data: { alert_email: 'ops@aaagencia.com.br' } }
    insertSpy = vi.fn(async () => ({ error: null }))
    heartbeatSpy = vi.fn(async () => ({ error: null }))
    getChannelStatusMock = vi.fn(async () => ({ status: 'connected' }))
    // Padrão: webhook armado e entregando. Cada teste que quer o contrário diz.
    lerWebhookMock = vi.fn(async () => ({
      suportado: true,
      urlEsperada: `https://proj.supabase.co/functions/v1/messaging-webhook-evolution/${CHANNEL_ID}`,
      saudavel: true,
      config: {
        enabled: true,
        url: `https://proj.supabase.co/functions/v1/messaging-webhook-evolution/${CHANNEL_ID}`,
        events: ['MESSAGES_UPSERT'],
        byEvents: true,
        hasAuthHeader: true,
      },
    }))
    resendSendMock = vi.fn(async () => ({ data: { id: 'email-1' }, error: null }))

    fromSpy = vi.fn((table: string) => {
      if (table === 'messaging_channels') return chainable(channelsResult)
      if (table === 'security_alerts') {
        const builder = chainable(recentAlertResult)
        builder.insert = insertSpy
        return builder
      }
      if (table === 'organization_settings') return chainable(orgSettingsResult)
      if (table === 'cron_heartbeats') {
        const builder = chainable({ error: null })
        builder.upsert = heartbeatSpy
        return builder
      }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  // Esta rota existiu sem heartbeat nenhum, e por isso o watchdog nunca a
  // vigiou — nem funcionando, nem nas ~20h respondendo 401. check_cron_heartbeats()
  // percorre as LINHAS de cron_heartbeats: sem linha, o cron é invisível.
  it('grava heartbeat em toda execução, mesmo com tudo saudável', async () => {
    channelsResult = {
      data: [{ id: CHANNEL_ID, organization_id: ORG_ID, name: 'Comercial', external_identifier: 'aaagencia-comercial' }],
      error: null,
    }

    await callGet()

    expect(heartbeatSpy).toHaveBeenCalledTimes(1)
    const [linha, opcoes] = heartbeatSpy.mock.calls[0]
    expect(linha.job_name).toBe('evolution-health')
    expect(linha.last_run_at).toBeTruthy()
    expect(opcoes).toEqual({ onConflict: 'job_name' })
  })

  it('grava heartbeat também quando não há canal nenhum pra checar', async () => {
    channelsResult = { data: [], error: null }

    await callGet()

    expect(heartbeatSpy).toHaveBeenCalledTimes(1)
  })

  it('retorna 401 sem CRON_SECRET correto', async () => {
    const req = new Request('http://localhost/api/cron/evolution-health', {
      headers: { Authorization: 'Bearer wrong-secret' },
    })

    const res = await GET(req as any)

    expect(res.status).toBe(401)
  })

  it('busca só canais Evolution com status connected (não alerta canal desconectado de propósito)', async () => {
    await callGet()

    expect(fromSpy).toHaveBeenCalledWith('messaging_channels')
    const channelsBuilder = fromSpy.mock.results[0].value

    expect(channelsBuilder.eq).toHaveBeenCalledWith('provider', 'evolution')
    expect(channelsBuilder.eq).toHaveBeenCalledWith('channel_type', 'whatsapp')
    expect(channelsBuilder.eq).toHaveBeenCalledWith('status', 'connected')
  })

  it('não alerta quando a sessão está conectada E o webhook está entregando', async () => {
    channelsResult = {
      data: [{ id: CHANNEL_ID, organization_id: ORG_ID, name: 'Comercial', external_identifier: 'aaagencia-comercial' }],
      error: null,
    }
    getChannelStatusMock = vi.fn(async () => ({ status: 'connected' }))

    const res = await callGet()
    const body = await res.json()

    expect(body).toEqual({ checked: 1, alerted: 0 })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  it('alerta quando a sessão está conectada mas o webhook não entrega — o caso real de 2026-08/09', async () => {
    channelsResult = {
      data: [{ id: CHANNEL_ID, organization_id: ORG_ID, name: 'Comercial', external_identifier: 'aaagencia-comercial' }],
      error: null,
    }
    getChannelStatusMock = vi.fn(async () => ({ status: 'connected' }))
    // Estado exato lido da Evolution em 2026-09-03: URL certa, resto zerado.
    lerWebhookMock = vi.fn(async () => ({
      suportado: true,
      urlEsperada: `https://proj.supabase.co/functions/v1/messaging-webhook-evolution/${CHANNEL_ID}`,
      saudavel: false,
      config: {
        enabled: false,
        url: `https://proj.supabase.co/functions/v1/messaging-webhook-evolution/${CHANNEL_ID}`,
        events: [],
        byEvents: false,
        hasAuthHeader: false,
      },
    }))

    const res = await callGet()
    const body = await res.json()

    expect(body).toEqual({ checked: 1, alerted: 1 })

    expect(insertSpy).toHaveBeenCalledTimes(1)
    const alerta = insertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(alerta.alert_type).toBe('evolution_webhook_inactive')
    expect(alerta.severity).toBe('critical')

    // O alerta precisa dizer O QUE consertar. "Webhook com problema" manda a
    // pessoa abrir o painel e adivinhar qual dos campos está errado.
    const problemas = (alerta.details as { problemas: string[] }).problemas
    expect(problemas).toEqual(
      expect.arrayContaining([
        expect.stringContaining('desabilitado'),
        expect.stringContaining('nenhum evento'),
        expect.stringContaining('x-api-key'),
      ]),
    )

    expect(resendSendMock).toHaveBeenCalledTimes(1)
  })

  it('não alerta webhook quando a sessão já está desconectada (um problema por vez, sem ruído)', async () => {
    channelsResult = {
      data: [{ id: CHANNEL_ID, organization_id: ORG_ID, name: 'Comercial', external_identifier: 'aaagencia-comercial' }],
      error: null,
    }
    getChannelStatusMock = vi.fn(async () => ({ status: 'close' }))

    const res = await callGet()
    const body = await res.json()

    expect(body).toEqual({ checked: 1, alerted: 1 })
    expect(lerWebhookMock).not.toHaveBeenCalled()
    expect((insertSpy.mock.calls[0][0] as Record<string, unknown>).alert_type).toBe('evolution_disconnected')
  })

  it('grava security_alerts e dispara e-mail quando a sessão está desconectada', async () => {
    channelsResult = {
      data: [{ id: CHANNEL_ID, organization_id: ORG_ID, name: 'Comercial', external_identifier: 'aaagencia-comercial' }],
      error: null,
    }
    getChannelStatusMock = vi.fn(async () => ({ status: 'close' }))

    const res = await callGet()
    const body = await res.json()

    expect(body).toEqual({ checked: 1, alerted: 1 })
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        alert_type: 'evolution_disconnected',
        severity: 'critical',
      })
    )
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ops@aaagencia.com.br',
        subject: expect.stringContaining('Comercial'),
      })
    )
  })

  it('não repete o alerta dentro do cooldown', async () => {
    channelsResult = {
      data: [{ id: CHANNEL_ID, organization_id: ORG_ID, name: 'Comercial', external_identifier: 'aaagencia-comercial' }],
      error: null,
    }
    getChannelStatusMock = vi.fn(async () => ({ status: 'close' }))
    recentAlertResult = { data: { id: 'alert-1' } }

    const res = await callGet()
    const body = await res.json()

    expect(body).toEqual({ checked: 1, alerted: 0 })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  it('grava o alerta mas não envia e-mail quando não há alert_email configurado', async () => {
    channelsResult = {
      data: [{ id: CHANNEL_ID, organization_id: ORG_ID, name: 'Comercial', external_identifier: 'aaagencia-comercial' }],
      error: null,
    }
    getChannelStatusMock = vi.fn(async () => ({ status: 'close' }))
    orgSettingsResult = { data: { alert_email: null } }

    const res = await callGet()
    const body = await res.json()

    expect(body).toEqual({ checked: 1, alerted: 1 })
    expect(insertSpy).toHaveBeenCalled()
    expect(resendSendMock).not.toHaveBeenCalled()
  })
})
