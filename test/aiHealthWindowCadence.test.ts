/**
 * Guarda do acoplamento entre a cadência do cron e a janela de "2ª falha
 * consecutiva" (issue #23, item 6).
 *
 * `CONSECUTIVE_WINDOW_MS` (app/api/cron/ai-health/route.ts) e a cadência do
 * job `ai-health-check` (na migration de pg_cron) vivem em arquivos
 * diferentes, sem nada ligando os dois. Se a cadência for esticada — por
 * exemplo pra rodar a cada 30 minutos, pra economizar crédito de IA — sem
 * revisar a janela, o modo de falha é silencioso: os registros de `severity=info` continuam
 * sendo gravados normalmente a cada execução, só que a consulta que decide
 * "isto é a 2ª falha?" (`created_at > now() - janela`) nunca mais encontra a
 * falha anterior, porque ela já saiu da janela antes da próxima execução
 * rodar. `segundaFalha` fica sempre `false`, e o e-mail nunca sai — sem
 * nenhum erro, sem nenhum log, sem nada que chame atenção.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')

function cadenciaDoAiHealthEmMinutos(): number {
  const sql = readFileSync(
    join(ROOT, 'supabase/migrations/20260901180000_pg_cron_health_checks.sql'),
    'utf-8',
  )
  const inicio = sql.indexOf("'ai-health-check'")
  expect(inicio, 'job ai-health-check não encontrado na migration').toBeGreaterThan(-1)
  const trecho = sql.slice(inicio, inicio + 300)
  const m = trecho.match(/'\*\/(\d+) \* \* \* \*'/)
  expect(m, 'cadência do ai-health-check não está no formato "*/N * * * *"').toBeTruthy()
  return Number((m as RegExpMatchArray)[1])
}

function janelaConsecutivaEmMinutos(): number {
  const ts = readFileSync(join(ROOT, 'app/api/cron/ai-health/route.ts'), 'utf-8')
  const m = ts.match(/CONSECUTIVE_WINDOW_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/)
  expect(m, 'CONSECUTIVE_WINDOW_MS não está no formato "N * 60 * 1000"').toBeTruthy()
  return Number((m as RegExpMatchArray)[1])
}

describe('janela de "2ª falha consecutiva" precisa ser maior que a cadência do cron', () => {
  it('CONSECUTIVE_WINDOW_MS cobre pelo menos 1 tick inteiro de cadência, com folga', () => {
    const cadencia = cadenciaDoAiHealthEmMinutos()
    const janela = janelaConsecutivaEmMinutos()
    // "Com folga", não só "maior": o comentário original já dizia 20min em vez
    // de 15min pra tolerar atraso de agendamento sem perder o par de falhas.
    // Exigir estritamente MAIOR (não >=) cobre o caso onde os dois valores empatam.
    expect(janela).toBeGreaterThan(cadencia)
  })
})
