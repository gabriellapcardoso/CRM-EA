/**
 * Guarda da migration de timeout do pg_net (issue #23, item 5).
 *
 * `check_cron_heartbeats()`/pg_cron rodam dentro do Postgres — o Postgres
 * local do `supabase start` não traz o schema `cron`/`net`, então não dá pra
 * exercitar a migration de verdade em teste automatizado (mesma limitação
 * das outras migrations de pg_cron deste repo). Este arquivo trava o que dá
 * pra verificar sem Postgres: o placeholder da URL e o timeout de verdade.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = join(__dirname, '..')

function ultimaMigrationDeTimeout(): string {
  const dir = join(raiz, 'supabase/migrations')
  const arquivo = readdirSync(dir)
    .filter((f) => /pg_net_timeout_health_checks/.test(f))
    .sort()
    .at(-1)
  expect(arquivo, 'migration de timeout do pg_net não encontrada').toBeTruthy()
  return readFileSync(join(dir, arquivo as string), 'utf-8')
}

function extrairValor(sqlTexto: string, nomeVar: string): string {
  const re = new RegExp(`${nomeVar}\\s+TEXT\\s*:=\\s*([^;]+);`)
  const m = sqlTexto.match(re)
  expect(m, `variável ${nomeVar} não encontrada`).toBeTruthy()
  return (m as RegExpMatchArray)[1]
}

function avaliarConcatenacaoSQL(expressao: string): string {
  return expressao
    .split('||')
    .map((parte) => parte.trim().replace(/^'|'$/g, ''))
    .join('')
}

function simularSubstituicao(sqlTexto: string, placeholder: string, valorReal: string): string {
  return sqlTexto.split(placeholder).join(valorReal)
}

describe('pg_net timeout — placeholder do CRON_SECRET', () => {
  it('tem a guarda que impede aplicar sem substituir __CRON_SECRET__', () => {
    const sql = ultimaMigrationDeTimeout()
    expect(sql).toMatch(/RAISE EXCEPTION/)
    expect(sql).toMatch(/CRON_SECRET não substituído/)
  })

  it('a guarda usa canário quebrado, não uma cópia do placeholder em dollar-quote', () => {
    // O bug real da migration anterior (dead-man's switch): comparar o
    // placeholder contra uma cópia dele mesmo faz a guarda disparar sempre,
    // substituído ou não, porque o find-and-replace troca os dois lados
    // igualmente. Ver DESAFIOS.md, 2026-09-01.
    const sql = ultimaMigrationDeTimeout()
    expect(sql).not.toMatch(/position\(/)
  })

  it('ANTES da substituição, os dois lados do comparador são iguais — a guarda deve disparar', () => {
    const sql = ultimaMigrationDeTimeout()
    for (const nomeVar of ['valor_no_arquivo', 'canario_do_placeholder']) {
      // ambos os blocos DO $$ têm as mesmas variáveis — pega a 1ª ocorrência de cada
      expect(extrairValor(sql, nomeVar)).toBeTruthy()
    }
    const valor = avaliarConcatenacaoSQL(extrairValor(sql, 'valor_no_arquivo'))
    const canario = avaliarConcatenacaoSQL(extrairValor(sql, 'canario_do_placeholder'))
    expect(valor).toBe(canario)
  })

  it('DEPOIS da substituição (sed simulado), os dois lados divergem — a guarda não deve disparar', () => {
    const sql = ultimaMigrationDeTimeout()
    const substituido = simularSubstituicao(sql, '__CRON_SECRET__', 'valor-de-producao-de-teste')
    const valor = avaliarConcatenacaoSQL(extrairValor(substituido, 'valor_no_arquivo'))
    const canario = avaliarConcatenacaoSQL(extrairValor(substituido, 'canario_do_placeholder'))
    expect(valor).not.toBe(canario)
  })

  it('não tem CRON_SECRET real commitado', () => {
    const sql = ultimaMigrationDeTimeout()
    expect(sql).not.toMatch(/Bearer '\s*\+\s*'(?!__CRON_SECRET__)[^']{10,}/)
  })
})

describe('pg_net timeout — timeout de verdade, folga acima do timeout interno de 20s', () => {
  it('os dois net.http_get usam timeout_milliseconds explícito, maior que o timeout interno de 20s', () => {
    const sql = ultimaMigrationDeTimeout()
    const ocorrencias = [...sql.matchAll(/timeout_milliseconds\s*:=\s*(\d+)/g)]
    expect(ocorrencias.length, 'nenhum timeout_milliseconds encontrado').toBeGreaterThan(0)
    for (const m of ocorrencias) {
      const ms = Number(m[1])
      // CHECK_TIMEOUT_MS em ai-health/route.ts é 20_000 — o timeout do pg_net
      // precisa cobrir isso com folga real, não só "maior que 5000" (o padrão
      // que estava causando o problema).
      expect(ms).toBeGreaterThan(20_000)
    }
  })

  it('reagenda os dois jobs (ai-health-check e evolution-health-check)', () => {
    const sql = ultimaMigrationDeTimeout()
    expect(sql).toMatch(/'ai-health-check'/)
    expect(sql).toMatch(/'evolution-health-check'/)
  })
})
