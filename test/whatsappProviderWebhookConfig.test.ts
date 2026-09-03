/**
 * Testes de configureWebhook()/getWebhookConfig() no provider Evolution.
 *
 * `configureWebhook()` existia desde 2026-07 e nunca tinha sido chamado por
 * nenhum caminho do app nem coberto por teste — o webhook era registrado à mão
 * no painel da Evolution. Foi assim que o canal da aaagência ficou 5 semanas
 * "conectado" e mudo: URL certa no painel, `enabled: false`, `events: []`,
 * `headers: null`.
 *
 * Guardas de regressão:
 * - o corpo vai aninhado sob `webhook` (a versão do servidor recusa o formato
 *   plano com 400 "instance requires property webhook")
 * - o `headers.x-api-key` vai junto — sem ele a Edge Function, que é
 *   default-deny, responde 401 e a Evolution engole em silêncio
 * - getWebhookConfig() nunca devolve o valor do header, só se ele existe
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EvolutionWhatsAppProvider } from '@/lib/messaging/providers/whatsapp/evolution.provider'

const CHANNEL_ID = 'cad3274f-2aba-4986-959a-a50ba0f9cb51'
const API_KEY = 'test-api-key'
const WEBHOOK_URL = `https://proj.supabase.co/functions/v1/messaging-webhook-evolution/${CHANNEL_ID}`

let fetchMock: ReturnType<typeof vi.fn>

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

async function makeProvider() {
  const provider = new EvolutionWhatsAppProvider()
  await provider.initialize({
    channelId: CHANNEL_ID,
    channelType: 'whatsapp',
    provider: 'evolution',
    externalIdentifier: 'canal-de-teste',
    credentials: {
      serverUrl: 'https://evo.example.com/',
      instanceName: 'aaagência',
      apiKey: API_KEY,
    },
  })
  return provider
}

describe('EvolutionWhatsAppProvider.configureWebhook', () => {
  it('manda o corpo aninhado sob `webhook`, com eventos e header de auth', async () => {
    fetchMock.mockResolvedValue(okResponse({ enabled: true }))
    const provider = await makeProvider()

    const r = await provider.configureWebhook(WEBHOOK_URL)

    expect(r.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://evo.example.com/webhook/set/aaagência')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body).toHaveProperty('webhook')
    expect(body.webhook.enabled).toBe(true)
    expect(body.webhook.url).toBe(WEBHOOK_URL)
    expect(body.webhook.events.length).toBeGreaterThan(0)
    // Sem este header a Edge Function recusa com 401 e a Evolution não reclama.
    expect(body.webhook.headers['x-api-key']).toBe(API_KEY)
  })

  it('servidor recusando vira success:false, nunca exceção solta', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'instance requires property "webhook"',
    } as unknown as Response)
    const provider = await makeProvider()

    const r = await provider.configureWebhook(WEBHOOK_URL)

    expect(r.success).toBe(false)
    expect(r.error).toContain('webhook')
  })
})

describe('EvolutionWhatsAppProvider.getWebhookConfig', () => {
  it('lê a config gravada no servidor', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        enabled: true,
        url: WEBHOOK_URL,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        webhookByEvents: true,
        headers: { 'x-api-key': API_KEY },
      }),
    )
    const provider = await makeProvider()

    const config = await provider.getWebhookConfig()

    expect(fetchMock.mock.calls[0][0]).toBe('https://evo.example.com/webhook/find/aaag%C3%AAncia')
    expect(config).toEqual({
      enabled: true,
      url: WEBHOOK_URL,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      byEvents: true,
      hasAuthHeader: true,
    })
  })

  it('nunca devolve o valor do header, só se ele existe', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ enabled: true, url: WEBHOOK_URL, events: ['MESSAGES_UPSERT'], headers: { 'x-api-key': API_KEY } }),
    )
    const provider = await makeProvider()

    const config = await provider.getWebhookConfig()

    expect(JSON.stringify(config)).not.toContain(API_KEY)
  })

  it('resposta real do incidente: URL certa, tudo o mais zerado', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        enabled: false,
        url: WEBHOOK_URL,
        events: [],
        webhookByEvents: false,
        headers: null,
      }),
    )
    const provider = await makeProvider()

    const config = await provider.getWebhookConfig()

    expect(config.enabled).toBe(false)
    expect(config.events).toEqual([])
    expect(config.hasAuthHeader).toBe(false)
    expect(config.url).toBe(WEBHOOK_URL)
  })

  it('header presente mas vazio não conta como auth configurada', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ enabled: true, url: WEBHOOK_URL, events: ['MESSAGES_UPSERT'], headers: { 'x-api-key': '' } }),
    )
    const provider = await makeProvider()

    expect((await provider.getWebhookConfig()).hasAuthHeader).toBe(false)
  })

  it('aceita o header em qualquer caixa, que é como HTTP funciona', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ enabled: true, url: WEBHOOK_URL, events: ['MESSAGES_UPSERT'], headers: { 'X-Api-Key': API_KEY } }),
    )
    const provider = await makeProvider()

    expect((await provider.getWebhookConfig()).hasAuthHeader).toBe(true)
  })
})
