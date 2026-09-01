/**
 * Regressão: telas do CRM mostravam/contavam registros soft-deletados
 * (`deleted_at` preenchido).
 *
 * Achado ao vivo em 2026-08-31: dois deals de teste ("teste ww — Proposta",
 * "Proposta Teste") foram soft-deletados via SQL, mas continuaram aparecendo
 * no board Pós-venda e somando R$ 5.600 no total da coluna mesmo depois de
 * refresh forçado. Causa raiz: `dealsService.getAll()` — a fonte única usada
 * por `useDealsByBoard`/`dealsViewQueryFn` em todo o app — nunca filtrava
 * `deleted_at`. O mesmo padrão faltava em `boardsService.canDelete()`,
 * `deleteStage()` e `moveDealsToBoard()`.
 *
 * A auditoria seguinte (mesma data, pedida depois do primeiro fix) achou a
 * MESMA classe de bug em mais 3 serviços, 2 deles com impacto visível na
 * hora: `activitiesService.getAll()` (3 atividades excluídas aparecendo na
 * tela de Atividades) e `companiesService.getAll()` (3 empresas excluídas
 * na tela de Empresas). `boardsService.getAll()` estava com o mesmo defeito,
 * latente só porque nenhum board tinha sido excluído ainda.
 *
 * `contactsService` já filtrava corretamente em todas as leituras — por isso
 * a tela de Contatos não mostrou os 49 contatos excluídos na limpeza.
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

describe('activitiesService.getAll — filtro de deleted_at', () => {
  it('inclui .is(deleted_at, null) na query que alimenta a tela de Atividades', async () => {
    const builder = chainable()
    const fromMock = vi.fn(() => builder)

    vi.doMock('@/lib/supabase/client', () => ({ supabase: { from: fromMock } }))

    const { activitiesService } = await import('@/lib/supabase/activities')
    await activitiesService.getAll()

    expect(fromMock).toHaveBeenCalledWith('activities')
    expect(hasCall(builder._calls, 'is', 'deleted_at', null)).toBe(true)

    vi.doUnmock('@/lib/supabase/client')
    vi.resetModules()
  })
})

describe('companiesService — filtro de deleted_at', () => {
  it('getAll() inclui .is(deleted_at, null) na tela de Empresas', async () => {
    const builder = chainable()
    const fromMock = vi.fn(() => builder)

    vi.doMock('@/lib/supabase/client', () => ({ supabase: { from: fromMock } }))

    const { companiesService } = await import('@/lib/supabase/contacts')
    await companiesService.getAll()

    expect(fromMock).toHaveBeenCalledWith('crm_companies')
    expect(hasCall(builder._calls, 'is', 'deleted_at', null)).toBe(true)

    vi.doUnmock('@/lib/supabase/client')
    vi.resetModules()
  })

  it('getByIds() não devolve empresa excluída vinculada a contato', async () => {
    const builder = chainable()
    builder.in = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const fromMock = vi.fn(() => builder)

    vi.doMock('@/lib/supabase/client', () => ({ supabase: { from: fromMock } }))

    const { companiesService } = await import('@/lib/supabase/contacts')
    await companiesService.getByIds(['company-1'])

    expect(hasCall(builder._calls, 'is', 'deleted_at', null)).toBe(true)

    vi.doUnmock('@/lib/supabase/client')
    vi.resetModules()
  })
})

describe('boardsService.getAll — filtro de deleted_at', () => {
  it('não lista board excluído na tela de Funis', async () => {
    const boardsBuilder = chainable()
    boardsBuilder.order = vi.fn(() => boardsBuilder)
    // segunda chamada de .order() resolve a promise (padrão do getAll)
    let orderCalls = 0
    boardsBuilder.order = vi.fn((...args: unknown[]) => {
      boardsBuilder._calls.push({ method: 'order', args })
      orderCalls += 1
      return orderCalls >= 2 ? Promise.resolve({ data: [], error: null }) : boardsBuilder
    })

    const stagesBuilder = chainable()
    stagesBuilder.order = vi.fn(() => Promise.resolve({ data: [], error: null }))

    const fromMock = vi.fn((table: string) =>
      table === 'boards' ? boardsBuilder : stagesBuilder
    )

    vi.doMock('@/lib/supabase/client', () => ({ supabase: { from: fromMock } }))

    const { boardsService } = await import('@/lib/supabase/boards')
    await boardsService.getAll()

    expect(fromMock).toHaveBeenCalledWith('boards')
    expect(hasCall(boardsBuilder._calls, 'is', 'deleted_at', null)).toBe(true)

    vi.doUnmock('@/lib/supabase/client')
    vi.resetModules()
  })
})
