/**
 * Guarda de `ai_conversation_log.model_used` (issue #23, item 8).
 *
 * O valor gravado era o modelo PEDIDO (`modelId`, vindo de `organization_settings`),
 * não o que respondeu. Se o failover nativo da OpenRouter (`lib/ai/config.ts`,
 * `extraBody.models`) resgatasse a chamada com outro modelo — o mesmo mecanismo
 * que salvou a aplicação em 2026-09-01 —, o log continuava afirmando o modelo
 * configurado. Dado falso exatamente no período em que auditar qual modelo
 * respondeu de verdade importa mais: durante um incidente.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let generateTextMock: ReturnType<typeof vi.fn>
let insertSpy: ReturnType<typeof vi.fn>
let requireAITaskContextMock: ReturnType<typeof vi.fn>

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (cfg: unknown) => cfg },
}))

vi.mock('@/lib/ai/tasks/server', () => {
  class AITaskHttpErrorStub extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message)
    }
    toResponse() {
      return new Response(JSON.stringify({ error: { code: this.code, message: this.message } }), { status: this.status })
    }
  }
  return {
    AITaskHttpError: AITaskHttpErrorStub,
    requireAITaskContext: (...args: unknown[]) => requireAITaskContextMock(...args),
  }
})

vi.mock('@/lib/ai/prompts/server', () => ({
  getResolvedPrompt: vi.fn(async () => ({ content: 'template {{dealTitle}}' })),
}))

vi.mock('@/lib/ai/features/server', () => ({
  isAIFeatureEnabled: vi.fn(async () => true),
}))

vi.mock('@/lib/ai/agent/input-filter', () => ({
  sanitizeIncomingMessage: (text: string) => ({ text }),
}))

import { POST } from './route'

function req(): Request {
  return new Request('https://exemplo.test/api/ai/tasks/deals/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deal: { title: 'Deal de teste', value: 1000, status: 'aberto', probability: 50 } }),
  })
}

function buildSupabaseStub() {
  return {
    from: (tabela: string) => {
      if (tabela === 'ai_conversation_log') {
        return { insert: (row: unknown) => insertSpy(row) }
      }
      throw new Error(`tabela não mockada neste teste: ${tabela}`)
    },
  }
}

beforeEach(() => {
  insertSpy = vi.fn(async () => ({ error: null }))
  requireAITaskContextMock = vi.fn(async () => ({
    supabase: buildSupabaseStub(),
    userId: 'user-id',
    organizationId: 'org-id',
    provider: 'openrouter',
    modelId: 'deepseek/deepseek-v4-flash-0731',
    apiKey: 'sk-or-fake',
    model: { modelId: 'deepseek/deepseek-v4-flash-0731' },
  }))
  generateTextMock = vi.fn(async () => ({
    output: { action: 'Ligar', reason: 'teste', actionType: 'CALL', urgency: 'low', probabilityScore: 60 },
    usage: { totalTokens: 12 },
    response: { modelId: 'deepseek/deepseek-v4-flash-0731' },
  }))
})

describe('model_used grava o modelo que RESPONDEU, não o pedido', () => {
  it('caminho normal: modelo respondeu igual ao pedido — grava o mesmo id', async () => {
    await POST(req())
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model_used: 'deepseek/deepseek-v4-flash-0731' }),
    )
  })

  it('failover: modelo respondeu DIFERENTE do pedido — grava o que respondeu, não o configurado', async () => {
    // Simula o cenário de 2026-09-01: o modelo configurado sumiu do catálogo,
    // a lista de reserva da OpenRouter resgatou a chamada com outro modelo.
    generateTextMock = vi.fn(async () => ({
      output: { action: 'Ligar', reason: 'teste', actionType: 'CALL', urgency: 'low', probabilityScore: 60 },
      usage: { totalTokens: 12 },
      response: { modelId: 'google/gemini-3.5-flash-lite' },
    }))
    await POST(req())
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model_used: 'google/gemini-3.5-flash-lite' }),
    )
  })

  it('resposta sem response.modelId cai pro modelo pedido, nunca grava vazio', async () => {
    generateTextMock = vi.fn(async () => ({
      output: { action: 'Ligar', reason: 'teste', actionType: 'CALL', urgency: 'low', probabilityScore: 60 },
      usage: { totalTokens: 12 },
      response: undefined,
    }))
    await POST(req())
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model_used: 'deepseek/deepseek-v4-flash-0731' }),
    )
  })
})
