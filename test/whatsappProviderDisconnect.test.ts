/**
 * Testes do disconnect() real dos providers de WhatsApp.
 *
 * Antes, os dois providers só logavam "disconnected" e nunca falavam com o
 * servidor — o botão "Desconectar" do CRM mentia: mudava o status no banco e
 * deixava a sessão viva do lado da Evolution/Z-API.
 *
 * Guardas de regressão:
 * - Evolution chama DELETE /instance/logout/{instance} com a apikey
 * - Z-API chama POST /{instanceId}/token/{token}/disconnect
 * - falha do servidor propaga (o caller precisa saber que não desconectou)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EvolutionWhatsAppProvider } from '@/lib/messaging/providers/whatsapp/evolution.provider'
import { ZApiWhatsAppProvider } from '@/lib/messaging/providers/whatsapp/z-api.provider'

const CHANNEL_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

let fetchMock: ReturnType<typeof vi.fn>

function okResponse(body: unknown = { status: 'SUCCESS' }) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

function errorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({ error: body }),
  } as unknown as Response
}

function emptyOkResponse(status = 204) {
  return {
    ok: true,
    status,
    text: async () => '',
    json: async () => { throw new Error('no body') },
  } as unknown as Response
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('EvolutionWhatsAppProvider.disconnect', () => {
  async function makeProvider() {
    const provider = new EvolutionWhatsAppProvider()
    await provider.initialize({
      channelId: CHANNEL_ID,
      channelType: 'whatsapp',
      provider: 'evolution',
      externalIdentifier: '+5511900000000',
      credentials: {
        serverUrl: 'https://evo.example.com/',
        instanceName: 'aaagência',
        apiKey: 'test-api-key',
      },
    })
    return provider
  }

  it('chama o endpoint de logout da instância no servidor Evolution', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const provider = await makeProvider()

    await provider.disconnect()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://evo.example.com/instance/logout/aaagência')
    expect(init.method).toBe('DELETE')
    expect(init.headers.apikey).toBe('test-api-key')
  })

  it('propaga erro quando o servidor recusa o logout', async () => {
    fetchMock.mockResolvedValue(errorResponse(404, 'instance not found'))
    const provider = await makeProvider()

    await expect(provider.disconnect()).rejects.toThrow(/404/)
  })

  it('regressão: 204 com corpo vazio não é tratado como erro de parse', async () => {
    fetchMock.mockResolvedValue(emptyOkResponse())
    const provider = await makeProvider()

    await expect(provider.disconnect()).resolves.toBeUndefined()
  })
})

describe('ZApiWhatsAppProvider.disconnect', () => {
  it('chama o endpoint de disconnect da instância na Z-API', async () => {
    fetchMock.mockResolvedValue(okResponse({ value: true }))

    const provider = new ZApiWhatsAppProvider()
    await provider.initialize({
      channelId: CHANNEL_ID,
      channelType: 'whatsapp',
      provider: 'z-api',
      externalIdentifier: '+5511900000000',
      credentials: {
        instanceId: 'inst-123',
        token: 'tok-456',
        clientToken: 'client-789',
      },
    })

    await provider.disconnect()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.z-api.io/instances/inst-123/token/tok-456/disconnect')
    expect(init.method).toBe('POST')
  })

  it('regressão: 204 com corpo vazio não é tratado como erro de parse', async () => {
    fetchMock.mockResolvedValue(emptyOkResponse())

    const provider = new ZApiWhatsAppProvider()
    await provider.initialize({
      channelId: CHANNEL_ID,
      channelType: 'whatsapp',
      provider: 'z-api',
      externalIdentifier: '+5511900000000',
      credentials: {
        instanceId: 'inst-123',
        token: 'tok-456',
        clientToken: 'client-789',
      },
    })

    await expect(provider.disconnect()).resolves.toBeUndefined()
  })
})
