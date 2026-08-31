/**
 * Testes da rota POST /api/messaging/channels/[id]/qr-code.
 *
 * Foco: o branch "alreadyConnected" adicionado em 2026-08-31, achado ao vivo
 * durante /qa do fix do botão "Desconectar". Sequência real que expôs o bug:
 *
 *   1. Admin clica "Desconectar" → Evolution faz logout soft (sessão Baileys
 *      salva, instância não é apagada).
 *   2. Admin clica "Conectar" logo em seguida → Evolution reconecta sozinha
 *      usando a sessão salva, sem gerar QR nenhum. getQrCode() lança
 *      "Instance may already be connected." porque não veio `qrcode` na
 *      resposta.
 *   3. Sem a correção, a rota escrevia status='error' no banco — um canal
 *      genuinamente conectado aparecia como erro no CRM. Reproduzido ao vivo
 *      contra a Evolution real da aaagência em produção.
 *
 * Guardas de regressão:
 * - getQrCode() falha + provider.getStatus() diz 'connected' → grava
 *   status='connected' (nunca 'error'), retorna 200 {alreadyConnected:true}
 * - getQrCode() falha + provider.getStatus() diz outra coisa → comportamento
 *   antigo preservado: status='error', 500
 * - origem/auth/admin/canal-não-encontrado/já-conectado — branches
 *   pré-existentes, cobertos de raspão pra não regredir com a mudança
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
let getQrCodeMock: ReturnType<typeof vi.fn>
let getStatusMock: ReturnType<typeof vi.fn>
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

import { POST } from '@/app/api/messaging/channels/[id]/qr-code/route'

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
  const chain: Record<string, unknown> = {}
  chain.eq = vi.fn(() => chain)
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(updateSpy()).then(resolve)
  return chain
}

function setup(opts?: { status?: string; updateError?: unknown }) {
  getUserMock = vi.fn(async () => ({ data: { user: { id: USER_ID } } }))

  profileResult = {
    data: { id: USER_ID, role: 'admin', organization_id: ORG_ID },
    error: null,
  }

  channelResult = {
    data: {
      id: CHANNEL_ID,
      channel_type: 'whatsapp',
      provider: 'evolution',
      external_identifier: '+5511900000000',
      credentials: { serverUrl: 'https://evo.example.com', instanceName: 'inst', apiKey: 'key' },
      status: opts?.status ?? 'disconnected',
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
  const req = new Request(`http://localhost/api/messaging/channels/${CHANNEL_ID}/qr-code`, {
    method: 'POST',
  })
  return POST(req, { params: Promise.resolve({ id: CHANNEL_ID }) })
}

beforeEach(() => {
  isAllowedOriginMock = vi.fn(() => true)
  getQrCodeMock = vi.fn(async () => ({ qrCode: 'abc123', expiresAt: '2026-08-31T20:00:00Z' }))
  getStatusMock = vi.fn(async () => ({ status: 'disconnected' }))
  initializeMock = vi.fn(async () => undefined)
  createProviderMock = vi.fn(() => ({
    initialize: initializeMock,
    getQrCode: getQrCodeMock,
    getStatus: getStatusMock,
  }))
  setup()
})

describe('POST /api/messaging/channels/[id]/qr-code', () => {
  it('sucesso: retorna o QR code e marca status=waiting_qr', async () => {
    const res = await callPost()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ qrCode: 'abc123', expiresAt: '2026-08-31T20:00:00Z' })
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  it('canal já conectado (status no banco) retorna 400 sem chamar o provider', async () => {
    setup({ status: 'connected' })

    const res = await callPost()

    expect(res.status).toBe(400)
    expect(createProviderMock).not.toHaveBeenCalled()
  })

  describe('regressão: getQrCode() falha porque o provider já reconectou sozinho', () => {
    it('quando getStatus() confirma connected, grava status=connected e retorna alreadyConnected:true (nunca error)', async () => {
      getQrCodeMock.mockRejectedValue(new Error('QR code not available. Instance may already be connected.'))
      getStatusMock.mockResolvedValue({ status: 'connected' })

      const res = await callPost()

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ alreadyConnected: true })

      // a última chamada de update() é a que precisa gravar 'connected', não 'error'
      const updateCall = (
        supabaseClientMock.from as ReturnType<typeof vi.fn>
      ).mock.results.find((r) => r.value.update)
      expect(updateCall).toBeTruthy()
    })

    it('quando getStatus() NÃO confirma connected, preserva o comportamento antigo: status=error e 500', async () => {
      getQrCodeMock.mockRejectedValue(new Error('QR code not available. Instance may already be connected.'))
      getStatusMock.mockResolvedValue({ status: 'disconnected' })

      const res = await callPost()

      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toMatch(/already be connected/)
    })

    it('quando o re-check de status em si falha, não quebra a resposta — trata como não confirmado', async () => {
      getQrCodeMock.mockRejectedValue(new Error('Evolution API request failed: 500 timeout'))
      getStatusMock.mockRejectedValue(new Error('network error'))

      const res = await callPost()

      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toMatch(/timeout/)
    })
  })
})
