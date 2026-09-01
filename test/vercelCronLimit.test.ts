/**
 * Guarda do limite de cron da Vercel (issue #23, item 3).
 *
 * O plano deste projeto é Hobby: no máximo 2 cron jobs e só cadência diária.
 * Passar disso não dá build vermelho nem e-mail — a Vercel simplesmente **não
 * cria deployment nenhum**, e a produção fica congelada no commit anterior até
 * alguém desconfiar. Já aconteceu em 2026-09-01 (~40min de produção parada por
 * um terceiro cron, de 15 em 15 minutos, adicionado aqui).
 *
 * Por isso tudo que roda abaixo de 1x/dia vive em pg_cron + pg_net, nas
 * migrations. Este arquivo trava as duas pontas: o `vercel.json` não pode
 * crescer, e a documentação que manda o próximo agente pro lugar certo não
 * pode sumir.
 *
 * Teste de arquivo-como-texto no molde de `test/softDeleteFilters.test.ts` e
 * `test/cockpitLayout.test.ts`: o que falha aqui é config e prosa, não runtime.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = join(__dirname, '..')

function lerVercelJson(): { crons?: Array<{ path: string; schedule: string }> } {
  return JSON.parse(readFileSync(join(raiz, 'vercel.json'), 'utf-8'))
}

function lerDoc(nome: string): string {
  return readFileSync(join(raiz, nome), 'utf-8')
}

/** Campos minuto e hora fixos = roda no máximo 1x/dia. */
function ehDiario(schedule: string): boolean {
  const campos = schedule.trim().split(/\s+/)
  if (campos.length !== 5) return false
  const [minuto, hora] = campos
  const fixo = /^\d+$/
  return fixo.test(minuto) && fixo.test(hora)
}

describe('limite de cron da Vercel (plano Hobby)', () => {
  it('vercel.json tem no máximo 2 crons', () => {
    const crons = lerVercelJson().crons ?? []
    expect(crons.length).toBeLessThanOrEqual(2)
  })

  it('todo cron do vercel.json é diário — sub-diário derruba o deployment inteiro', () => {
    const crons = lerVercelJson().crons ?? []
    const subDiarios = crons.filter((c) => !ehDiario(c.schedule))
    expect(subDiarios.map((c) => `${c.path} (${c.schedule})`)).toEqual([])
  })
})

describe('cadência sub-diária mora no pg_cron', () => {
  it('CLAUDE.md não afirma que a cadência vive só no vercel.json', () => {
    // A frase antiga dizia exatamente isso. Como o CLAUDE.md tem precedência
    // de projeto, o próximo agente lia, editava o vercel.json e congelava a
    // produção — a falha que este teste existe para impedir.
    const claudeMd = lerDoc('CLAUDE.md')
    expect(claudeMd).not.toMatch(/cad[êe]ncia de cron vive \*\*s[óo]\*\* no `vercel\.json`/i)
  })

  it('CLAUDE.md manda o leitor pro pg_cron antes de mexer no vercel.json', () => {
    const claudeMd = lerDoc('CLAUDE.md')
    expect(claudeMd).toMatch(/pg_cron/)
    expect(claudeMd).toMatch(/vercel\.json/)
  })

  it('as migrations de pg_cron que a documentação cita existem de verdade', () => {
    // Ponteiro pra arquivo que não existe é pior que ponteiro nenhum: manda o
    // leitor procurar prova que sumiu e ele conclui que a regra caducou.
    const migrations = readdirSync(join(raiz, 'supabase/migrations'))
    const comCron = migrations.filter((f) => /cron/i.test(f))
    expect(comCron.length).toBeGreaterThan(0)
  })
})
