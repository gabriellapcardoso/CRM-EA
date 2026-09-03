/**
 * Guarda da escolha de template por estágio em `POST /api/ai/provision-stages`.
 *
 * O bug: `Math.min(stage.order, 3)` usava o VALOR de `order`. Os boards deste
 * projeto começam em `order: 1` (verificado nos dois boards da org), então cada
 * estágio recebia o template do estágio seguinte — e o `BANT_STAGE_PROMPTS[0]`,
 * o único que diz "este é o PRIMEIRO contato com o lead", era inalcançável.
 *
 * Na prática, o primeiro estágio de um board novo ganhava o prompt que assume
 * que o lead JÁ falou com a empresa antes. O agente abriria a conversa se
 * referindo a um contato que nunca existiu.
 *
 * Agrava porque a rota faz `update` em config existente: clicar em provisionar
 * sobrescreve uma configuração já ajustada à mão com o template errado.
 *
 * A correção é indexar pela POSIÇÃO na lista ordenada, que é 0-based por
 * definição e independe da convenção de numeração de quem criou o board.
 *
 * Comentários são removidos antes de casar — teste que lê arquivo tem que ler
 * código. Ver `DESAFIOS.md`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(
  join(process.cwd(), 'app/api/ai/provision-stages/route.ts'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * Reproduz as duas estratégias de indexação sobre um board 1-based real
 * (Negociação: 15 estágios, `order` de 1 a 15).
 */
function escolherPorValorDeOrder(orders: number[]): number[] {
  return orders.map((order) => Math.min(order, 3));
}
function escolherPorPosicao(orders: number[]): number[] {
  return orders.map((_, posicao) => Math.min(posicao, 3));
}

const ORDERS_REAIS = Array.from({ length: 15 }, (_, i) => i + 1); // 1..15

describe('escolha do template por estágio', () => {
  it('a rota indexa por posição, não pelo valor de order', () => {
    expect(FONTE).toContain('stages.entries()');
    expect(FONTE).toMatch(/Math\.min\(\s*posicao\s*,\s*3\s*\)/);
    expect(FONTE).not.toMatch(/Math\.min\(\s*stage\.order\s*,\s*3\s*\)/);
  });

  it('por posição, o primeiro estágio recebe o template de PRIMEIRO contato', () => {
    expect(escolherPorPosicao(ORDERS_REAIS)[0]).toBe(0);
  });

  it('pelo valor de order, o template 0 seria inalcançável num board 1-based', () => {
    // Documenta o bug: é isto que acontecia em produção.
    expect(escolherPorValorDeOrder(ORDERS_REAIS)).not.toContain(0);
    expect(escolherPorValorDeOrder(ORDERS_REAIS)[0]).toBe(1);
  });

  it('os quatro templates existem e o cap em 3 não estoura', () => {
    for (const indice of escolherPorPosicao(ORDERS_REAIS)) {
      expect(indice).toBeGreaterThanOrEqual(0);
      expect(indice).toBeLessThanOrEqual(3);
    }
    expect(FONTE).toMatch(/BANT_STAGE_PROMPTS\s*:\s*Record<number/);
    for (const indice of [0, 1, 2, 3]) {
      expect(FONTE).toMatch(new RegExp(`^\\s*${indice}:\\s*\\{`, 'm'));
    }
  });

  it('board de um estágio só recebe o template de primeiro contato', () => {
    expect(escolherPorPosicao([1])).toEqual([0]);
  });
});
