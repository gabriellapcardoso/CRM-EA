/**
 * Guarda de `comLimiteDeConcorrencia` (issue #23, item 17).
 */
import { describe, expect, it } from 'vitest'
import { comLimiteDeConcorrencia } from './concurrency'

describe('comLimiteDeConcorrencia', () => {
  it('roda todas as tarefas e preserva a ordem dos resultados', async () => {
    const tarefas = [1, 2, 3, 4, 5].map((n) => async () => n * 10)
    const resultados = await comLimiteDeConcorrencia(tarefas, 2)
    expect(resultados).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 40 },
      { status: 'fulfilled', value: 50 },
    ])
  })

  it('nunca roda mais tarefas simultâneas do que o limite', async () => {
    // Esta é a asserção que este mecanismo existe pra garantir. Sem o limite,
    // as 10 tarefas rodariam todas ao mesmo tempo — exatamente o cenário que
    // faz o número de chamadas simultâneas à OpenRouter/Supabase crescer
    // junto com o número de orgs.
    let emVoo = 0
    let picoDeConcorrencia = 0
    const tarefas = Array.from({ length: 10 }, () => async () => {
      emVoo++
      picoDeConcorrencia = Math.max(picoDeConcorrencia, emVoo)
      await new Promise((resolve) => setTimeout(resolve, 5))
      emVoo--
      return 'ok'
    })

    await comLimiteDeConcorrencia(tarefas, 3)
    expect(picoDeConcorrencia).toBeLessThanOrEqual(3)
    expect(picoDeConcorrencia).toBeGreaterThan(1) // prova que roda em paralelo, não sequencial
  })

  it('tarefa rejeitada não derruba as outras — captura como rejected na posição certa', async () => {
    const tarefas = [
      async () => 'primeira',
      async () => {
        throw new Error('falhou')
      },
      async () => 'terceira',
    ]
    const resultados = await comLimiteDeConcorrencia(tarefas, 2)
    expect(resultados[0]).toEqual({ status: 'fulfilled', value: 'primeira' })
    expect(resultados[1].status).toBe('rejected')
    expect(resultados[2]).toEqual({ status: 'fulfilled', value: 'terceira' })
  })

  it('lista vazia não trava (zero trabalhadores, não divisão por zero)', async () => {
    const resultados = await comLimiteDeConcorrencia([], 5)
    expect(resultados).toEqual([])
  })

  it('limite maior que o número de tarefas não quebra nada', async () => {
    const tarefas = [async () => 1, async () => 2]
    const resultados = await comLimiteDeConcorrencia(tarefas, 100)
    expect(resultados).toHaveLength(2)
  })
})
