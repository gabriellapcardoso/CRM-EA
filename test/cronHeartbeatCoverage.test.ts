/**
 * Amarra as três peças do watchdog de cron, que hoje moram em arquivos
 * diferentes e podem divergir em silêncio:
 *
 *   1. a rota de health check escreve em `cron_heartbeats`
 *   2. o `job_name` que ela escreve está semeado numa migration
 *   3. o job existe no pg_cron apontando pra ela
 *
 * O item 2 é o que faltava e custou caro. `check_cron_heartbeats()` percorre as
 * LINHAS da tabela: cron sem linha nunca entra no laço. Em 2026-09-02 os dois
 * health checks passaram a responder 401 por CRON_SECRET errado; o `ai-health`
 * foi pego em 50 minutos porque tinha linha, e o `evolution-health` não foi
 * pego nunca, porque não tinha. O único cron invisível era o único sem
 * heartbeat.
 *
 * Este teste lê os arquivos reais em vez de reafirmar constantes: um health
 * check novo que esqueça o heartbeat ou a semeadura falha aqui, no CI, e não
 * seis semanas depois durante um incidente.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const DIR_CRON = join(RAIZ, 'app/api/cron');
const DIR_MIGRATIONS = join(RAIZ, 'supabase/migrations');

/**
 * Rotas de cron que precisam de heartbeat: as que existem pra vigiar outra
 * coisa. Se elas param, ninguém fica sabendo de nada — é o pior modo de falha
 * do sistema inteiro, porque o silêncio é indistinguível de saúde.
 *
 * `template-sync` e `stage-evaluations` ficam de fora conscientemente: são
 * trabalho, não vigilância. Quando pararem, o efeito aparece no produto
 * (template desatualizado, deal parado), não em silêncio absoluto.
 */
const ROTAS_QUE_VIGIAM = ['ai-health', 'evolution-health'];

function lerRota(nome: string): string {
  const caminho = join(DIR_CRON, nome, 'route.ts');
  expect(existsSync(caminho), `rota ${nome} não existe em app/api/cron/`).toBe(true);
  return readFileSync(caminho, 'utf8');
}

function todasAsMigrations(): string {
  return readdirSync(DIR_MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(DIR_MIGRATIONS, f), 'utf8'))
    .join('\n');
}

describe('cobertura de heartbeat dos crons de vigilância', () => {
  it.each(ROTAS_QUE_VIGIAM)('%s escreve em cron_heartbeats', (nome) => {
    expect(lerRota(nome)).toContain('cron_heartbeats');
  });

  it.each(ROTAS_QUE_VIGIAM)('%s grava o job_name que a semeadura espera', (nome) => {
    const fonte = lerRota(nome);
    // O nome do heartbeat é o nome da pasta da rota. Divergir aqui cria uma
    // linha órfã semeada e um heartbeat vivo que ninguém vigia — duas metades
    // que parecem certas separadas.
    expect(fonte).toMatch(new RegExp(`job_name:\\s*['"]${nome}['"]`));
  });

  it.each(ROTAS_QUE_VIGIAM)('%s está semeado em alguma migration', (nome) => {
    const sql = todasAsMigrations();
    expect(sql).toMatch(
      new RegExp(`insert into public\\.cron_heartbeats[\\s\\S]*?'${nome}'`, 'i'),
    );
  });

  it('a semeadura não sobrescreve heartbeat existente', () => {
    const sql = todasAsMigrations();
    const bloco = sql.match(/insert into public\.cron_heartbeats[\s\S]*?;/i)?.[0] ?? '';

    // Empurrar `last_run_at` pra frente numa reaplicação mascararia um cron
    // atrasado de verdade: o watchdog veria um sinal recente que ninguém emitiu.
    expect(bloco.toLowerCase()).toContain('on conflict');
    expect(bloco.toLowerCase()).toContain('do nothing');
  });

  it('o watchdog continua percorrendo cron_heartbeats — se isso mudar, a semeadura perde o sentido', () => {
    const sql = todasAsMigrations();
    expect(sql).toContain('check_cron_heartbeats');
    expect(sql).toMatch(/from public\.cron_heartbeats\s+where last_run_at </i);
  });
});
