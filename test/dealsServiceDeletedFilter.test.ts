/**
 * Regressão: board (Negociação/Pós-venda) e utilitários de board mostravam/
 * contavam deals soft-deletados (deleted_at preenchido).
 *
 * Achado ao vivo em 2026-08-31: dois deals de teste ("teste ww — Proposta",
 * "Proposta Teste") foram soft-deletados via SQL, mas continuaram aparecendo
 * no board Pós-venda e somando R$ 5.600 no total da coluna mesmo depois de
 * refresh forçado. Causa raiz: `dealsService.getAll()` — a fonte única usada
 * por `useDealsByBoard`/`dealsViewQueryFn` em todo o app — nunca filtrava
 * `deleted_at`. O mesmo padrão faltava em `boardsService.canDelete()`,
 * `deleteStage()` e `moveDealsToBoard()`.
 *
 * Guardas de regressão: cada chamada precisa incluir `.is('deleted_at', null)`
 * na query real enviada ao Supabase.
 */
import { describe, expect, it, vi } from 'vitest'

function chainable() {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'is', 'order', 'abortSignal', 'update']
  for (const m of methods) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args })
      return builder
    })
  }
  builder.limit = vi.fn((...args: unknown[]) => {
    calls.push({ method: 'limit', args })
    return Promise.resolve({ data: [], error: null })
  })
  ;(builder as { _calls: typeof calls })._calls = calls
  return builder as typeof builder & { _calls: typeof calls }
}

function hasCall(calls: { method: string; args: unknown[] }[], method: string, ...args: unknown[]) {
  return calls.some((c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args))
}

describe('dealsService.getAll — filtro de deleted_at', () => {
  it('inclui .is(deleted_at, null) na query que alimenta o board', async () => {
    const dealsBuilder = chainable()
    const fromMock = vi.fn(() => dealsBuilder)

    vi.doMock('@/lib/supabase/client', () => ({ supabase: { from: fromMock } }))

    const { dealsService } = await import('@/lib/supabase/deals')
    await dealsService.getAll()

    expect(fromMock).toHaveBeenCalledWith('deals')
    expect(hasCall(dealsBuilder._calls, 'is', 'deleted_at', null)).toBe(true)

    vi.doUnmock('@/lib/supabase/client')
    vi.resetModules()
  })
})

describe('boardsService — filtro de deleted_at nas operações sobre deals', () => {
  it('canDelete() conta só deals ativos', async () => {
    const dealsBuilder = chainable()
    const fromMock = vi.fn((table: string) => (table === 'deals' ? dealsBuilder : chainable()))

    vi.doMock('@/lib/supabase/client', () => ({ supabase: { from: fromMock } }))

    const { boardsService } = await import('@/lib/supabase/boards')
    await boardsService.canDelete('board-1')

    expect(hasCall(dealsBuilder._calls, 'is', 'deleted_at', null)).toBe(true)

    vi.doUnmock('@/lib/supabase/client')
    vi.resetModules()
  })

  it('deleteStage() conta só deals ativos no estágio', async () => {
    const dealsBuilder = chainable()
    const fromMock = vi.fn((table: string) => (table === 'deals' ? dealsBuilder : chainable()))

    vi.doMock('@/lib/supabase/client', () => ({ supabase: { from: fromMock } }))

    const { boardsService } = await import('@/lib/supabase/boards')
    await boardsService.deleteStage('stage-1')

    expect(hasCall(dealsBuilder._calls, 'is', 'deleted_at', null)).toBe(true)

    vi.doUnmock('@/lib/supabase/client')
    vi.resetModules()
  })

  it('moveDealsToBoard() só move deals ativos (não ressuscita deal excluído)', async () => {
    const dealsBuilder = chainable()
    const stagesBuilder = chainable()
    stagesBuilder.limit = vi.fn(() => Promise.resolve({ data: [{ id: 'stage-dest' }], error: null }))

    const fromMock = vi.fn((table: string) => {
      if (table === 'deals') return dealsBuilder
      if (table === 'board_stages') return stagesBuilder
      return chainable()
    })

    vi.doMock('@/lib/supabase/client', () => ({ supabase: { from: fromMock } }))

    const { boardsService } = await import('@/lib/supabase/boards')
    await boardsService.moveDealsToBoard('board-from', 'board-to')

    expect(hasCall(dealsBuilder._calls, 'is', 'deleted_at', null)).toBe(true)

    vi.doUnmock('@/lib/supabase/client')
    vi.resetModules()
  })
})
