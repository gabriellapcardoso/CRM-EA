/**
 * Testes de getQrCode() no provider Evolution.
 *
 * O bug: o tipo declarava `{ qrcode: { base64 } }` e o método lia
 * `response.qrcode?.base64`. A Evolution v2 devolve o QR PLANO —
 * `{ code, count, base64, pairingCode }` — então essa leitura era sempre
 * `undefined` e getQrCode() lançava SEMPRE, inclusive com o QR pronto no corpo
 * da resposta. Confirmado ao vivo contra o servidor em 2026-09-03, com e sem
 * `?number=`: as duas formas devolvem o mesmo objeto plano.
 *
 * O custo real não foi o QR faltando na tela. Foi o texto do erro: "Instance
 * may already be connected" era um palpite, e em 2026-08-31 foi lido como
 * diagnóstico — virou a justificativa do branch `alreadyConnected` da rota, que
 * remarcava o canal como conectado. Um erro que afirma causa não verificada
 * vira causa raiz falsa na sessão seguinte.
 *
 * Segundo defeito, achado quando a fundadora clicou Conectar de verdade
 * (2026-09-03): o método mandava `?number=`, e com número a Evolution escolhe o
 * fluxo de "vincular com número de telefone" — responde `{ pairingCode, count }`,
 * sem imagem. O código então exigia um base64 que nunca viria. Medido nas duas
 * direções contra a mesma instância real: sem `number` vem `base64`, com
 * `number` vem `pairingCode`.
 *
 * Guardas de regressão:
 * - resposta plana (o que o servidor realmente manda) devolve o QR
 * - a URL NÃO carrega `number` — é o que suprime o QR
 * - resposta aninhada continua funcionando (versões antigas)
 * - sem QR nenhum, o erro NOMEIA os campos recebidos e não chuta a causa
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EvolutionWhatsAppProvider } from '@/lib/messaging/providers/whatsapp/evolution.provider'

const CHANNEL_ID = 'cad3274f-2aba-4986-959a-a50ba0f9cb51'
const QR = 'data:image/png;base64,iVBORw0KGgoAAAANS'

let fetchMock: ReturnType<typeof vi.fn>

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
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
      instanceName: 'aaagencia-whatsapp',
      apiKey: 'test-api-key',
    },
  })
  return provider
}

describe('EvolutionWhatsAppProvider.getQrCode', () => {
  it('lê o QR da resposta PLANA, que é o que a Evolution v2 manda', async () => {
    fetchMock.mockResolvedValue(okResponse({ code: '2@abc', count: 1, base64: QR, pairingCode: null }))
    const provider = await makeProvider()

    const r = await provider.getQrCode()

    expect(r.qrCode).toBe(QR)
    expect(r.expiresAt).toBeTruthy()
  })

  // `?number=` faz a Evolution devolver pairingCode em vez de QR. Foi o que
  // quebrou o clique real em 2026-09-03. A URL não pode carregar number.
  it('não manda ?number= na URL, que é o que suprime o QR', async () => {
    fetchMock.mockResolvedValue(okResponse({ base64: QR }))
    const provider = await makeProvider()

    await provider.getQrCode()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://evo.example.com/instance/connect/aaagencia-whatsapp')
    expect(url).not.toContain('number=')
  })

  it('resposta com pairingCode e sem base64 falha nomeando os dois campos', async () => {
    fetchMock.mockResolvedValue(okResponse({ pairingCode: 'ABCD1234', count: 1 }))
    const provider = await makeProvider()

    await expect(provider.getQrCode()).rejects.toThrow(/campos recebidos: pairingCode, count/)
  })

  it('o base64 vem pronto pra <img src>, com o prefixo data URI', async () => {
    fetchMock.mockResolvedValue(okResponse({ base64: QR }))
    const provider = await makeProvider()

    expect((await provider.getQrCode()).qrCode).toMatch(/^data:image\/png;base64,/)
  })

  it('resposta aninhada continua funcionando (versões antigas)', async () => {
    fetchMock.mockResolvedValue(okResponse({ qrcode: { base64: QR } }))
    const provider = await makeProvider()

    expect((await provider.getQrCode()).qrCode).toBe(QR)
  })

  it('sem QR nenhum, o erro nomeia os campos recebidos e não chuta a causa', async () => {
    fetchMock.mockResolvedValue(okResponse({ instance: { state: 'open' } }))
    const provider = await makeProvider()

    await expect(provider.getQrCode()).rejects.toThrow(/campos recebidos: instance/)
    // O texto antigo afirmava "Instance may already be connected" sem ter
    // checado nada, e essa frase virou diagnóstico numa sessão seguinte.
    await expect(provider.getQrCode()).rejects.not.toThrow(/already be connected/)
  })

  it('erro explícito da Evolution continua propagando', async () => {
    fetchMock.mockResolvedValue(okResponse({ error: 'instance not found' }))
    const provider = await makeProvider()

    await expect(provider.getQrCode()).rejects.toThrow(/instance not found/)
  })
})
