/**
 * Guarda do texto que distingue "sem sugestão" de "sem serviço" (issue #16)
 * e do texto que diferencia queda de IA de estado de config (issue #23, item 2).
 *
 * Em 2026-09-01 a IA do CRM ficou fora do ar e o cockpit dizia calmamente
 * "Sem sugestão da IA no momento" — exatamente o mesmo texto de quando a IA
 * funciona e não tem nada a sugerir. A operadora agiu achando que o deal não
 * tinha sugestão, quando na verdade não havia IA nenhuma. O erro já chegava no
 * cliente em `aiAnalysis.error` e era descartado.
 *
 * Depois, "IA fora do ar" virou o texto padrão pra QUALQUER erro — inclusive
 * 403 AI_FEATURE_DISABLED (org desligou de propósito) e 401 UNAUTHORIZED
 * (sessão expirada), que não são queda nenhuma. `describeAIError` diferencia
 * pelo `errorCode`; este arquivo testa a função de verdade, não grep de texto.
 *
 * Teste de código-como-texto SÓ pra parte que não dá pra chamar direto: o
 * `useMemo` de `nextBestAction` vive dentro de um componente de 2600 linhas
 * com AuthContext, TanStack Query, Supabase e Realtime, e montá-lo inteiro
 * custaria caro e quebraria por motivos alheios ao que se quer proteger.
 * Cuidado que a versão anterior deste arquivo não tinha: `toContain('IA fora
 * do ar')` batendo em COMENTÁRIO, não em código — passava mesmo com o texto
 * fora do branch funcional. Por isso a checagem de branching abaixo isola o
 * bloco de código sem comentários antes de procurar qualquer string nele.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeAIError } from '@/features/inbox/hooks/useAIDealAnalysis'

const fonte = readFileSync(
  join(__dirname, '..', 'features/deals/cockpit/DealCockpitClient.tsx'),
  'utf8',
)

/** Bloco do fallback de `nextBestAction`, com comentários de linha removidos. */
function blocoFallbackSemComentarios(): string {
  const inicio = fonte.indexOf('const nextBestAction = useMemo(')
  expect(inicio).toBeGreaterThan(-1)
  const fim = fonte.indexOf('}, [aiAnalysis]);', inicio)
  expect(fim).toBeGreaterThan(inicio)
  const bloco = fonte.slice(inicio, fim)
  return bloco
    .split('\n')
    .map((linha) => linha.replace(/\/\/.*$/, ''))
    .join('\n')
}

describe('cockpit — sem sugestão x sem serviço', () => {
  it('ramifica o motivo em aiAnalysis.error', () => {
    // Sem esta ramificação os dois casos voltam a mostrar o mesmo texto, que é
    // precisamente o que enganou a operadora durante o incidente.
    expect(blocoFallbackSemComentarios()).toMatch(/aiAnalysis\?\.error/)
  })

  it('mantém o texto original para o caso de realmente não haver sugestão', () => {
    expect(blocoFallbackSemComentarios()).toContain('Sem sugestão da IA no momento')
  })

  it('delega o texto de erro pra describeAIError, não repete string solta', () => {
    // Repetir a string aqui é o que causou a divergência: um lugar diz "IA
    // fora do ar" pra todo erro, outro lugar (describeAIError) sabe diferenciar.
    // Duas fontes de verdade convergem sempre pra uma regredir sozinha.
    expect(blocoFallbackSemComentarios()).toMatch(/describeAIError\(/)
  })

  it('a ação sugerida continua a mesma nos dois casos', () => {
    // Só o motivo muda: o que a pessoa faz a seguir (analisar na mão) é igual,
    // então duplicar a ação seria ruído.
    const ocorrencias = blocoFallbackSemComentarios().match(/Analisar deal manualmente/g) ?? []
    expect(ocorrencias).toHaveLength(1)
  })
})

describe('describeAIError — diferencia queda de verdade de estado de config', () => {
  it('AI_DISABLED e AI_FEATURE_DISABLED não dizem "fora do ar"', () => {
    expect(describeAIError('AI_DISABLED')).not.toMatch(/fora do ar/i)
    expect(describeAIError('AI_FEATURE_DISABLED')).not.toMatch(/fora do ar/i)
  })

  it('UNAUTHORIZED não diz "fora do ar" — é sessão, não queda', () => {
    expect(describeAIError('UNAUTHORIZED')).not.toMatch(/fora do ar/i)
  })

  it('AI_KEY_NOT_CONFIGURED não diz "fora do ar" — é config ausente, não queda', () => {
    expect(describeAIError('AI_KEY_NOT_CONFIGURED')).not.toMatch(/fora do ar/i)
  })

  it('código desconhecido e ausente caem no texto de queda de verdade', () => {
    expect(describeAIError('INTERNAL_ERROR')).toMatch(/fora do ar/i)
    expect(describeAIError(undefined)).toMatch(/fora do ar/i)
  })

  it('todo código mapeado produz um texto distinto — sem string repetida escondendo a distinção', () => {
    const codigos = ['AI_DISABLED', 'AI_FEATURE_DISABLED', 'AI_KEY_NOT_CONFIGURED', 'UNAUTHORIZED', 'INTERNAL_ERROR']
    const textos = codigos.map(describeAIError)
    expect(new Set(textos).size).toBeGreaterThan(1)
  })
})
