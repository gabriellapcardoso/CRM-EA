/**
 * Testes da rota POST /api/messaging/channels/[id]/disconnect.
 *
 * Antes desta rota, o botão "Desconectar" só escrevia status='disconnected'
 * no banco — a sessão continuava viva do lado da Evolution/Z-API. Esta rota
 * chama provider.disconnect() de verdade e só marca o canal como
 * desconectado depois (ou mesmo se o provider falhar, pra não deixar o
 * canal preso em "conectado" por causa de uma credencial quebrada).
 *
 * Guardas de regressão:
 * - origem não permitida -> 403 antes de tocar em auth/banco
 * - sem sessão -> 401
 * - perfil sem organization_id -> 404
 * - não-admin -> 403
 * - canal não encontrado (ou de outra org) -> 404
 * - sucesso: provider.disconnect() chamado, status atualizado, providerDisconnected=true
 * - falha do provider: não propaga erro, status ainda é atualizado, providerDisconnected=false + warning
 * - falha ao atualizar o banco: não vira 500 (mesmo padrão do qr-code/route.ts)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
const ORG_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6'
const CHANNEL_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-a1b2c3d4e5f6'

let supabaseClientMock: Record<string, unknown>
let getUserMock: ReturnType<typeof vi.fn>
let profileResult: { data: unknown; error: unknown }
let channelResult: { data: unknown; error: unknown }
let updateSpy: ReturnType<typeof vi.fn>
let isAllowedOriginMock: ReturnType<typeof vi.fn>
let disconnectMock: ReturnType<typeof vi.fn>
let initializeMock: ReturnType<typeof vi.fn>
let createProviderMock: ReturnType<typeof vi.fn>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}))

vi.mock('@/lib/security/sameOrigin', () => ({
  isAllowedOrigin: (...args: unknown[]) => isAllowedOriginMock(...args),
}))

vi.mock('@/lib/messaging', () => ({
  ChannelProviderFactory: {
    createProvider: (...args: unknown[]) => createProviderMock(...args),
  },
}))

import { POST } from '@/app/api/messaging/channels/[id]/disconnect/route'

function buildProfileQB() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => profileResult),
  }
}

function buildChannelQB() {
  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
  }
  builder.single = vi.fn(async () => channelResult)
  return builder
}

function buildUpdateChain() {
  // update().eq().eq() resolve com { error }
  const chain: Record<string, unknown> = {}
  chain.eq = vi.fn(() => chain)
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(updateSpy()).then(resolve)
  return chain
}

function setup(opts?: {
  userId?: string | null
  role?: string | null
  organizationId?: string | null
  channel?: Record<string, unknown> | null
  updateError?: unknown
}) {
  getUserMock = vi.fn(async () => ({
    data: {
      user: 'userId' in (opts ?? {}) ? (opts!.userId === null ? null : { id: opts?.userId ?? USER_ID }) : { id: USER_ID },
    },
  }))

  profileResult = {
    data:
      opts?.organizationId === null
        ? null
        : {
            id: USER_ID,
            role: opts?.role ?? 'admin',
            organization_id: opts?.organizationId ?? ORG_ID,
          },
    error: null,
  }

  channelResult = {
    data:
      opts?.channel === null
        ? null
        : {
            id: CHANNEL_ID,
            channel_type: 'whatsapp',
            provider: 'evolution',
            external_identifier: '+5511900000000',
            credentials: { serverUrl: 'https://evo.example.com', instanceName: 'inst', apiKey: 'key' },
            status: 'connected',
            ...(opts?.channel ?? {}),
          },
    error: null,
  }

  updateSpy = vi.fn(async () => ({ error: opts?.updateError ?? null }))

  supabaseClientMock = {
    auth: { getUser: getUserMock },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return buildProfileQB()
      if (table === 'messaging_channels') {
        return {
          ...buildChannelQB(),
          update: vi.fn(() => buildUpdateChain()),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    }),
  }
}

function callPost() {
  const req = new Request(`http://localhost/api/messaging/channels/${CHANNEL_ID}/disconnect`, {
    method: 'POST',
  })
  return POST(req, { params: Promise.resolve({ id: CHANNEL_ID }) })
}

beforeEach(() => {
  isAllowedOriginMock = vi.fn(() => true)
  disconnectMock = vi.fn(async () => undefined)
  initializeMock = vi.fn(async () => undefined)
  createProviderMock = vi.fn(() => ({
    initialize: initializeMock,
    disconnect: disconnectMock,
  }))
  setup()
})

describe('POST /api/messaging/channels/[id]/disconnect', () => {
  it('retorna 403 quando a origem não é permitida (antes de checar auth)', async () => {
    isAllowedOriginMock.mockReturnValue(false)

    const res = await callPost()

    expect(res.status).toBe(403)
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('retorna 401 quando não há sessão', async () => {
    setup({ userId: null })

    const res = await callPost()

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('retorna 404 quando o perfil não tem organization_id', async () => {
    setup({ organizationId: null })

    const res = await callPost()

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Profile not found')
  })

  it('retorna 403 quando o usuário não é admin', async () => {
    setup({ role: 'member' })

    const res = await callPost()

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden - Admin access required')
  })

  it('retorna 404 quando o canal não existe (ou é de outra org)', async () => {
    setup({ channel: null })

    const res = await callPost()

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Channel not found')
  })

  it('sucesso: chama provider.disconnect(), atualiza status e retorna providerDisconnected=true', async () => {
    const res = await callPost()

    expect(res.status).toBe(200)
    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: CHANNEL_ID, channelType: 'whatsapp' })
    )
    expect(disconnectMock).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)

    const body = await res.json()
    expect(body).toEqual({ success: true, providerDisconnected: true, persisted: true, warning: undefined })
  })

  it('quando o provider falha, ainda marca o canal como desconectado e reporta o aviso (sem 500)', async () => {
    disconnectMock.mockRejectedValue(new Error('Evolution: 404 instance not found'))

    const res = await callPost()

    expect(res.status).toBe(200)
    expect(updateSpy).toHaveBeenCalledTimes(1)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.providerDisconnected).toBe(false)
    expect(body.warning).toMatch(/instance not found/)
  })

  it('quando a atualização do banco falha, ainda retorna 200 (não vira 500) e sinaliza persisted=false', async () => {
    setup({ updateError: { message: 'db unavailable' } })

    const res = await callPost()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.persisted).toBe(false)
  })
})
