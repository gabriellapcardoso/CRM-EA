/**
 * Impede o retorno de `toISOString().split('T')[0]` no código do cliente.
 *
 * O idioma converte pra UTC antes de cortar a data. Em São Paulo (GMT-3), toda
 * hora local a partir das 21:00 já é o dia seguinte em UTC — então a data
 * derivada assim fica um dia à frente durante três horas, todas as noites.
 *
 * Estava em 13 pontos. Os do cliente causavam, em produção:
 * lista de "atividades de hoje" vazia depois das 21:00; botões "Hoje"/"Amanhã"
 * gravando um dia a mais; e o pior, abrir uma atividade das 22:00 para editar
 * mostrava o dia seguinte no formulário — salvar movia a atividade um dia à
 * frente, corrompendo o dado em vez de só exibi-lo errado.
 *
 * Nada disso aparece pra quem testa de manhã: fora da janela das 21:00 à
 * meia-noite, o resultado é idêntico ao correto. Por isso a guarda é estática,
 * e não um teste de comportamento — o comportamento só diverge no horário em
 * que ninguém está olhando.
 *
 * Servidor fica de fora de propósito: a Vercel roda em UTC e ali `toISOString()`
 * é o comportamento pretendido. Os pontos de servidor que MERECEM o fuso da org
 * (`lib/mcp/tools/ai.ts`, API pública) estão no `TODOS.md`.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();

/** Onde o código roda no navegador, com o fuso de quem está olhando. */
const DIRS_DE_CLIENTE = ['features', 'lib/query', 'components'];

/** O padrão proibido, em suas duas grafias. */
const PADRAO_PROIBIDO = /toISOString\(\)\s*\.\s*(split\(['"]T['"]\)\s*\[\s*0\s*\]|slice\(\s*0\s*,\s*10\s*\))/;

function arquivosDeCodigo(dir: string, acc: string[] = []): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const nome of entradas) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivosDeCodigo(caminho, acc);
      continue;
    }
    if (!/\.tsx?$/.test(nome)) continue;
    if (/\.test\.tsx?$/.test(nome)) continue;
    acc.push(caminho);
  }
  return acc;
}

describe('data derivada no cliente usa o fuso local, não UTC', () => {
  it('nenhum arquivo de cliente monta data com toISOString', () => {
    const infratores: string[] = [];

    for (const dir of DIRS_DE_CLIENTE) {
      for (const arquivo of arquivosDeCodigo(join(RAIZ, dir))) {
        const conteudo = readFileSync(arquivo, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        if (PADRAO_PROIBIDO.test(conteudo)) {
          infratores.push(relative(RAIZ, arquivo));
        }
      }
    }

    expect(
      infratores,
      `Use dataLocalISO()/hojeLocalISO() de @/lib/utils/dataLocal. ` +
        `toISOString() passa por UTC e adianta a data em um dia das 21h à meia-noite (GMT-3). ` +
        `Arquivos: ${infratores.join(', ')}`,
    ).toEqual([]);
  });

  it('o próprio padrão de busca reconhece as duas grafias', () => {
    expect(PADRAO_PROIBIDO.test("new Date().toISOString().split('T')[0]")).toBe(true);
    expect(PADRAO_PROIBIDO.test('d.toISOString().slice(0, 10)')).toBe(true);
    expect(PADRAO_PROIBIDO.test('d.toISOString()')).toBe(false);
  });

  it('o helper existe e é o caminho recomendado', () => {
    const helper = readFileSync(join(RAIZ, 'lib/utils/dataLocal.ts'), 'utf8');
    expect(helper).toContain('export function dataLocalISO');
    expect(helper).toContain('getFullYear()');
    // Se o helper passar a usar toISOString internamente, a guarda vira teatro.
    expect(helper.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toContain('toISOString');
  });
});
