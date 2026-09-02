/**
 * Guarda do dead-man's switch externo (issue #23, item 1).
 *
 * `check_cron_heartbeats()` roda em pg_cron, dentro do Postgres — o Postgres
 * local do `supabase start` não traz o schema `cron`/`net`, então não dá pra
 * exercitar a função de verdade em teste automatizado (mesma limitação das
 * outras migrations de pg_cron deste repo, todas sem teste JS/TS). Este
 * arquivo trava as duas coisas que PODEM quebrar em silêncio sem precisar de
 * Postgres: o placeholder da URL e a condição do ping.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = join(__dirname, '..')

function ultimaMigrationDoWatchdog(): string {
  const dir = join(raiz, 'supabase/migrations')
  const arquivo = readdirSync(dir)
    .filter((f) => /healthchecks_dead_mans_switch/.test(f))
    .sort()
    .at(-1)
  expect(arquivo, 'migration do dead-man\'s switch não encontrada').toBeTruthy()
  return readFileSync(join(dir, arquivo as string), 'utf-8')
}

describe('dead-man\'s switch — placeholder da URL', () => {
  it('tem a guarda que impede aplicar sem substituir __HEALTHCHECKS_PING_URL__', () => {
    // Mesmo padrão do CRON_SECRET (20260901180000_pg_cron_health_checks.sql):
    // sem isto, um db push aplicaria o placeholder literal e o ping nunca
    // sairia — o dead-man's switch ficaria morto desde o dia 1, sem avisar.
    const sql = ultimaMigrationDoWatchdog()
    expect(sql).toMatch(/RAISE EXCEPTION/)
    expect(sql).toMatch(/HEALTHCHECKS_PING_URL não substituído/)
  })

  it('não tem uma Ping URL real commitada (é placeholder, repo é público)', () => {
    const sql = ultimaMigrationDoWatchdog()
    // UUID de verdade tem hex; o placeholder não.
    const uuidReal = /hc-ping\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    expect(sql).not.toMatch(uuidReal)
  })
})

describe('dead-man\'s switch — o ping só sai quando está tudo saudável', () => {
  it('o net.http_get do ping vive dentro do IF NOT algum_atrasado', () => {
    // Se o ping saísse incondicionalmente, o watchdog continuaria avisando
    // "estou vivo" mesmo com ai-health ou evolution-health mortos há dias —
    // o cenário exato que este mecanismo existe pra cobrir quando
    // security_alerts/e-mail falhar também.
    const sql = ultimaMigrationDoWatchdog()
    const inicioIf = sql.indexOf('IF NOT algum_atrasado THEN')
    expect(inicioIf, 'condição "IF NOT algum_atrasado THEN" não encontrada').toBeGreaterThan(-1)
    const fimIf = sql.indexOf('END IF;', inicioIf)
    const blocoIf = sql.slice(inicioIf, fimIf)
    expect(blocoIf).toMatch(/net\.http_get/)
  })

  it('o ping não aparece fora desse bloco condicional', () => {
    const sql = ultimaMigrationDoWatchdog()
    const ocorrencias = [...sql.matchAll(/net\.http_get/g)]
    // Só esta migration deveria chamar net.http_get pro ping do watchdog —
    // uma segunda chamada solta seria o sinal de alguém ter movido o ping
    // pra fora da condição (ou duplicado por engano).
    expect(ocorrencias).toHaveLength(1)
  })
})
