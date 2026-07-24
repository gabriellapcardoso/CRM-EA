/**
 * Testes de integração para o cron de health-check da sessão Evolution (T4).
 *
 * GET /api/cron/evolution-health
 *
 * Verifica auth por CRON_SECRET, que só alerta canais realmente
 * desconectados (não os desconectados de propósito), respeita o cooldown
 * de 4h entre alertas do mesmo canal, grava em security_alerts e dispara
 * e-mail via Resend quando há alert_email configurado.
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
let resendSendMock: ReturnType<typeof vi.fn>
let fromSpy: ReturnType<typeof vi.fn>

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
    getChannelStatusMock = vi.fn(async () => ({ status: 'connected' }))
    resendSendMock = vi.fn(async () => ({ data: { id: 'email-1' }, error: null }))

    fromSpy = vi.fn((table: string) => {
      if (table === 'messaging_channels') return chainable(channelsResult)
      if (table === 'security_alerts') {
        const builder = chainable(recentAlertResult)
        builder.insert = insertSpy
        return builder
      }
      if (table === 'organization_settings') return chainable(orgSettingsResult)
      throw new Error(`Unexpected table: ${table}`)
    })
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

  it('não alerta quando o canal está com sessão conectada de verdade', async () => {
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
