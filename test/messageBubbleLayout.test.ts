/**
 * Guarda da diagramação da bolha de mensagem.
 *
 * As mensagens do lead apareciam uma letra por linha. A causa não era a bolha:
 * era a linha que a envolve. Ela era um flex anônimo sem largura, dentro de
 * `.message`, que tem `align-items: flex-start` — ou seja, encolhia até o
 * conteúdo. Com isso o `max-width: 62%` da bolha passava a ser 62% de uma caixa
 * cuja largura dependia da própria bolha. Percentual com referência circular o
 * navegador resolve perto de zero, e `overflow-wrap` faz o resto: uma letra por
 * linha.
 *
 * O conserto move o limite de largura para uma coluna com largura de referência
 * definida (`.message__row`, 100% da linha). Se alguém devolver o limite para a
 * bolha ou tirar a largura da linha, o bug volta igual — por isso as três
 * asserções abaixo são sobre a *estrutura*, não sobre a aparência.
 *
 * Layout não é testável em happy-dom (sem engine de layout), então isto lê o
 * CSS como texto — com os comentários removidos antes de casar, senão a prosa
 * que explica o conserto passa a satisfazer o teste sozinha.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function semComentarios(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const CSS = semComentarios('app/globals.css');
const BUBBLE = semComentarios('features/messaging/components/MessageBubble.tsx');

/** Corpo de uma regra CSS pelo seletor exato. */
function regra(seletor: string): string {
  const match = CSS.match(
    new RegExp(`(^|\\n)${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`),
  );
  expect(match, `regra ${seletor} não encontrada`).not.toBeNull();
  return match![2];
}

describe('diagramação da bolha de mensagem', () => {
  it('a linha da mensagem ocupa a largura toda — é ela que dá referência ao percentual', () => {
    expect(regra('.message__row')).toMatch(/width:\s*100%/);
  });

  it('o limite de 62% vive na coluna, não na bolha', () => {
    expect(regra('.message__stack')).toMatch(/max-width:\s*62%/);
    // Bolha limitada pela coluna. Um percentual aqui volta a depender de uma
    // caixa de largura indefinida.
    expect(regra('.message__bubble')).toMatch(/max-width:\s*100%/);
  });

  it('a coluna pode encolher abaixo do conteúdo — sem isso, palavra longa estoura a linha', () => {
    expect(regra('.message__stack')).toMatch(/min-width:\s*0/);
  });

  it('o componente usa as duas classes — CSS certo em marcação errada não conserta nada', () => {
    expect(BUBBLE).toContain('className="message__row"');
    expect(BUBBLE).toMatch(/className="message__stack[^"]*"/);
  });

  it('bolha nossa e da IA encostam à direita', () => {
    expect(CSS).toMatch(
      /\.message--out\s+\.message__row,\s*\.message--ai\s+\.message__row\s*\{[^}]*justify-content:\s*flex-end/,
    );
  });
});
