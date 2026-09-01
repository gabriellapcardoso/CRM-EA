/**
 * Guarda do texto que distingue "sem sugestão" de "sem serviço" (issue #16).
 *
 * Em 2026-09-01 a IA do CRM ficou fora do ar e o cockpit dizia calmamente
 * "Sem sugestão da IA no momento" — exatamente o mesmo texto de quando a IA
 * funciona e não tem nada a sugerir. A operadora agiu achando que o deal não
 * tinha sugestão, quando na verdade não havia IA nenhuma. O erro já chegava no
 * cliente em `aiAnalysis.error` e era descartado.
 *
 * Teste de código-como-texto, não de render: o `useMemo` que decide isso vive
 * dentro de um componente de 2600 linhas com AuthContext, TanStack Query,
 * Supabase e Realtime, e montá-lo inteiro pra checar uma string custaria caro e
 * quebraria por motivos alheios ao que se quer proteger. O que precisa não
 * regredir é a ramificação existir e os dois textos serem distintos.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const fonte = readFileSync(
  join(__dirname, '..', 'features/deals/cockpit/DealCockpitClient.tsx'),
  'utf8',
)

/** Bloco do fallback de `nextBestAction` — o trecho que decide o texto. */
function blocoFallback(): string {
  const inicio = fonte.indexOf('const nextBestAction = useMemo(')
  expect(inicio).toBeGreaterThan(-1)
  const fim = fonte.indexOf('}, [aiAnalysis]);', inicio)
  expect(fim).toBeGreaterThan(inicio)
  return fonte.slice(inicio, fim)
}

describe('cockpit — sem sugestão x sem serviço', () => {
  it('ramifica o motivo em aiAnalysis.error', () => {
    // Sem esta ramificação os dois casos voltam a mostrar o mesmo texto, que é
    // precisamente o que enganou a operadora durante o incidente.
    expect(blocoFallback()).toMatch(/aiAnalysis\?\.error/)
  })

  it('mantém o texto original para o caso de realmente não haver sugestão', () => {
    expect(blocoFallback()).toContain('Sem sugestão da IA no momento')
  })

  it('tem texto próprio para IA indisponível', () => {
    expect(blocoFallback()).toContain('IA fora do ar')
  })

  it('os dois textos são diferentes entre si', () => {
    // Guarda contra alguém "unificar as strings" e reintroduzir o bug.
    const bloco = blocoFallback()
    const semSugestao = bloco.includes('Sem sugestão da IA no momento')
    const foraDoAr = bloco.includes('IA fora do ar')
    expect(semSugestao && foraDoAr).toBe(true)
  })

  it('a ação sugerida continua a mesma nos dois casos', () => {
    // Só o motivo muda: o que a pessoa faz a seguir (analisar na mão) é igual,
    // então duplicar a ação seria ruído.
    const ocorrencias = blocoFallback().match(/Analisar deal manualmente/g) ?? []
    expect(ocorrencias).toHaveLength(1)
  })
})
