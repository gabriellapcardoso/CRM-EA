/**
 * Testes para a API de segurança do canal WhatsApp (T4).
 *
 * GET/POST /api/settings/whatsapp-safety
 *
 * Expõe kill switch (`whatsapp_kill_switch_active`) e e-mail de alerta
 * (`alert_email`) do health-check da sessão Evolution. Só admin escreve.
 */
import { beforeEach, describe, expect, it } from 'vitest'

const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
const ORG_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6'

let profileQueryBuilder: Record<string, unknown>
let orgSettingsQueryBuilder: Record<string, unknown>
let authMock: Record<string, unknown>
let supabaseClientMock: Record<string, unknown>
let upsertSpy: ReturnType<typeof vi.fn>

import { vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}))

import { GET, POST } from '@/app/api/settings/whatsapp-safety/route'

function buildProfileQB(role: 'admin' | 'member' | null = 'admin', orgId: string | null = ORG_ID) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({
      data: orgId ? { organization_id: orgId, role } : null,
      error: null,
    })),
  }
}

function buildOrgSettingsQB(
  killSwitch = false,
  alertEmail: string | null = null,
  autoSendProposalWhatsapp = false
) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: {
        whatsapp_kill_switch_active: killSwitch,
        alert_email: alertEmail,
        auto_send_proposal_whatsapp: autoSendProposalWhatsapp,
      },
      error: null,
    })),
  }
}

function buildAuthMock(userId: string | null = USER_ID) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : { message: 'not authenticated' },
      })),
    },
  }
}

function setupClient(opts?: {
  role?: 'admin' | 'member' | null
  killSwitch?: boolean
  alertEmail?: string | null
  autoSendProposalWhatsapp?: boolean
  userId?: string | null
}) {
  profileQueryBuilder = buildProfileQB(opts?.role ?? 'admin')
  orgSettingsQueryBuilder = buildOrgSettingsQB(
    opts?.killSwitch ?? false,
    opts?.alertEmail ?? null,
    opts?.autoSendProposalWhatsapp ?? false
  )
  authMock = buildAuthMock('userId' in (opts ?? {}) ? opts!.userId! : USER_ID)
  upsertSpy = vi.fn(async () => ({ error: null }))

  supabaseClientMock = {
    ...authMock,
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profileQueryBuilder
      if (table === 'organization_settings') {
        return { ...orgSettingsQueryBuilder, upsert: upsertSpy }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

async function callGet(): Promise<Response> {
  const req = new Request('http://localhost/api/settings/whatsapp-safety')
  return GET(req as any)
}

async function callPost(body: unknown): Promise<Response> {
  const req = new Request('http://localhost/api/settings/whatsapp-safety', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return POST(req as any)
}

describe('GET /api/settings/whatsapp-safety', () => {
  beforeEach(() => {
    setupClient()
  })

  it('retorna 401 quando não autenticado', async () => {
    setupClient({ userId: null })

    const res = await callGet()

    expect(res.status).toBe(401)
  })

  it('retorna kill switch e e-mail de alerta atuais', async () => {
    setupClient({ killSwitch: true, alertEmail: 'ops@aaagencia.com.br' })

    const res = await callGet()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      killSwitchActive: true,
      alertEmail: 'ops@aaagencia.com.br',
      autoSendProposalWhatsapp: false,
    })
  })

  it('retorna kill switch desligado e e-mail nulo por padrão', async () => {
    const res = await callGet()
    const body = await res.json()

    expect(body).toEqual({
      killSwitchActive: false,
      alertEmail: null,
      autoSendProposalWhatsapp: false,
    })
  })

  it('retorna auto_send_proposal_whatsapp ligado quando a org habilitou', async () => {
    setupClient({ autoSendProposalWhatsapp: true })

    const res = await callGet()
    const body = await res.json()

    expect(body).toMatchObject({ autoSendProposalWhatsapp: true })
  })
})

describe('POST /api/settings/whatsapp-safety', () => {
  beforeEach(() => {
    setupClient()
  })

  it('retorna 401 quando não autenticado', async () => {
    setupClient({ userId: null })

    const res = await callPost({ killSwitchActive: true })

    expect(res.status).toBe(401)
  })

  it('retorna 403 quando usuário não é admin', async () => {
    setupClient({ role: 'member' })

    const res = await callPost({ killSwitchActive: true })

    expect(res.status).toBe(403)
  })

  it('ativa o kill switch e persiste em organization_settings', async () => {
    const res = await callPost({ killSwitchActive: true })

    expect(res.status).toBe(200)
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        whatsapp_kill_switch_active: true,
      }),
      { onConflict: 'organization_id' }
    )
  })

  it('atualiza o e-mail de alerta', async () => {
    const res = await callPost({ alertEmail: 'fundadora@aaagencia.com.br' })

    expect(res.status).toBe(200)
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        alert_email: 'fundadora@aaagencia.com.br',
      }),
      { onConflict: 'organization_id' }
    )
  })

  it('normaliza e-mail vazio para null', async () => {
    const res = await callPost({ alertEmail: '  ' })

    expect(res.status).toBe(200)
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ alert_email: null }),
      { onConflict: 'organization_id' }
    )
  })

  it('retorna 400 para payload inválido', async () => {
    const res = await callPost({ killSwitchActive: 'not-a-boolean' })

    expect(res.status).toBe(400)
  })

  it('retorna 400 para e-mail de alerta com formato inválido', async () => {
    const res = await callPost({ alertEmail: 'nao-e-email' })

    expect(res.status).toBe(400)
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('retorna 400 para autoSendProposalWhatsapp com tipo inválido', async () => {
    const res = await callPost({ autoSendProposalWhatsapp: 'not-a-boolean' })

    expect(res.status).toBe(400)
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('desliga o envio automático de proposta por WhatsApp e persiste em organization_settings', async () => {
    const res = await callPost({ autoSendProposalWhatsapp: false })

    expect(res.status).toBe(200)
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        auto_send_proposal_whatsapp: false,
      }),
      { onConflict: 'organization_id' }
    )
  })

  it('ativa o envio automático de proposta por WhatsApp e persiste em organization_settings', async () => {
    const res = await callPost({ autoSendProposalWhatsapp: true })

    expect(res.status).toBe(200)
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        auto_send_proposal_whatsapp: true,
      }),
      { onConflict: 'organization_id' }
    )
  })

  it('atualiza apenas autoSendProposalWhatsapp no upsert, sem tocar em outros campos', async () => {
    const res = await callPost({ autoSendProposalWhatsapp: true })

    expect(res.status).toBe(200)
    const [payload] = upsertSpy.mock.calls[0]
    expect(Object.keys(payload).sort()).toEqual(
      ['auto_send_proposal_whatsapp', 'organization_id', 'updated_at'].sort()
    )
  })

  it('atualiza killSwitchActive e autoSendProposalWhatsapp juntos no mesmo POST', async () => {
    const res = await callPost({ killSwitchActive: true, autoSendProposalWhatsapp: true })

    expect(res.status).toBe(200)
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        whatsapp_kill_switch_active: true,
        auto_send_proposal_whatsapp: true,
      }),
      { onConflict: 'organization_id' }
    )
  })

  it('retorna 403 quando usuário não é admin e tenta ligar autoSendProposalWhatsapp', async () => {
    setupClient({ role: 'member' })

    const res = await callPost({ autoSendProposalWhatsapp: true })

    expect(res.status).toBe(403)
    expect(upsertSpy).not.toHaveBeenCalled()
  })
})
