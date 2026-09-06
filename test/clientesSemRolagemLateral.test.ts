/**
 * Invariantes de layout do Módulo Clientes.
 *
 * Layout não é testável em happy-dom: não há motor de layout, então
 * `getBoundingClientRect()` devolve zero e `scrollWidth === clientWidth`
 * sempre. Renderizar o componente e afirmar "não estoura" é falso-positivo.
 * O que dá pra afirmar como texto é o CSS compilado — e é isso que estas
 * guardas fazem. A medição de verdade é no navegador, com a tela aberta.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const CSS = readFileSync(join(RAIZ, 'app/globals.css'), 'utf-8');

function arquivosDoModulo(): string[] {
    const encontrados: string[] = [];
    const andar = (dir: string) => {
        for (const entrada of readdirSync(dir)) {
            const caminho = join(dir, entrada);
            if (statSync(caminho).isDirectory()) andar(caminho);
            else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
                encontrados.push(caminho);
            }
        }
    };
    andar(join(RAIZ, 'features/clients'));
    return encontrados;
}

const FONTES = arquivosDoModulo().map(caminho => ({
    caminho: caminho.replace(`${RAIZ}/`, ''),
    conteudo: readFileSync(caminho, 'utf-8'),
}));

describe('grade dos indicadores', () => {
    // `.kpi-grid` é `repeat(4, 1fr)` fixo: com a barra lateral e o painel de
    // IA abertos num monitor de 1280 sobram ~660px, e quatro colunas rígidas
    // estouram pro lado.
    it('a variante fluida existe e é usada pelo módulo', () => {
        expect(CSS).toMatch(/\.kpi-grid--fluid\s*\{[^}]*repeat\(auto-fit/);
        const barra = FONTES.find(f => f.caminho.endsWith('ClientsMetricsBar.tsx'));
        expect(barra?.conteudo).toContain('kpi-grid kpi-grid--fluid');
    });

    // Piso puro de 200px sobrepõe a largura do container e a rolagem lateral
    // volta — mesma razão do `min()` no `.card-approval`, que não é enfeite.
    it('o piso da coluna passa por min(), nunca um pixel solto', () => {
        const regra = CSS.match(/\.kpi-grid--fluid\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(regra).toContain('minmax(min(');
        expect(regra).not.toMatch(/minmax\(\s*\d+px/);
    });

    it('a .kpi-grid original segue intacta — dashboard e inbox dependem dela', () => {
        expect(CSS).toMatch(/\.kpi-grid \{ display: grid; grid-template-columns: repeat\(4, 1fr\)/);
    });
});

describe('tabela da carteira', () => {
    // `.table-list` tem piso de 840px porque a lista do pipeline e o catálogo
    // de produtos usam a mesma classe e têm outras colunas. A carteira tem
    // seis colunas curtas e usa o modificador que dispensa o piso.
    it('usa .table-list--fit', () => {
        const lista = FONTES.find(f => f.caminho.endsWith('ClientsList.tsx'));
        expect(lista?.conteudo).toContain('table-list table-list--fit');
    });

    it('o piso global do .table-list continua onde estava', () => {
        expect(CSS).toMatch(/\.table-list \{[^}]*min-width: 840px/);
        expect(CSS).toMatch(/\.table-list--fit \{ min-width: 0/);
    });
});

describe('vocabulário visual', () => {
    /**
     * Classe que o componente emite sem regra correspondente é no-op
     * silencioso: o CSS não avisa, o build passa, e o elemento fica sem
     * estilo nenhum. Aconteceu ao escrever este módulo — `.cell-hint` e
     * `.text-faint` foram emitidas e não existiam.
     *
     * Só classes do vocabulário semântico entram na conferência; utilitário
     * do Tailwind é gerado em outro lugar.
     */
    it('não emite classe semântica que o globals.css não define', () => {
        const conhecidasDoTailwind = /^(sr-only|num)$/;
        const orfas: string[] = [];

        for (const { caminho, conteudo } of FONTES) {
            for (const m of conteudo.matchAll(/className="([^"{}]+)"/g)) {
                for (const classe of m[1].split(/\s+/).filter(Boolean)) {
                    if (conhecidasDoTailwind.test(classe)) continue;
                    // Vocabulário semântico deste repositório: minúsculas com
                    // hífen ou BEM. Utilitário Tailwind (md:, w-96, bg-x/10)
                    // não entra.
                    if (!/^[a-z][a-z0-9_-]*$/.test(classe)) continue;
                    const regra = new RegExp(
                        `\\.${classe.replace(/[-]/g, '\\-')}(?![a-zA-Z0-9_-])`,
                    );
                    if (!regra.test(CSS)) orfas.push(`${caminho}: .${classe}`);
                }
            }
        }

        expect(orfas).toEqual([]);
    });

    // O app é claro-só: o ThemeProvider força darkMode = false e apaga a
    // classe `dark` do <html>. Paleta escura fixa aqui apareceria como um
    // bloco escuro no meio do produto claro, como aconteceu com o
    // FocusContextPanel em 2026-09-05.
    it('não usa paleta escura fixa nem variante dark:', () => {
        const suspeitas: string[] = [];
        for (const { caminho, conteudo } of FONTES) {
            const semComentario = conteudo
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            for (const padrao of [
                /\bdark:[a-z-]/g,
                /\b(bg|text|border)-(slate|gray|zinc)-(600|700|800|900|950)\b/g,
            ]) {
                for (const m of semComentario.matchAll(padrao)) {
                    suspeitas.push(`${caminho}: ${m[0]}`);
                }
            }
        }
        expect(suspeitas).toEqual([]);
    });
});

describe('vocabulário próprio, sem colidir com o que já existe', () => {
    /**
     * `.timeline` já existia neste arquivo (linhas ~1176), usado pelo cockpit
     * do deal, pelo detalhe do contato e pelo ActivityRow. Escrever um segundo
     * `.timeline__item` na F2 fez as duas famílias brigarem: a de baixo venceu
     * nas propriedades compartilhadas — o item do cliente herdou
     * `align-items: center` e apareceu centralizado — e o meu
     * `list-style/margin/padding` passou a valer nas telas deles, que ninguém
     * mediu. Mesma classe de estrago do `.table-list`.
     */
    it('o módulo não emite as classes .timeline* compartilhadas', () => {
        const infratores: string[] = [];
        for (const { caminho, conteudo } of FONTES) {
            for (const m of conteudo.matchAll(/className="([^"{}]+)"/g)) {
                for (const classe of m[1].split(/\s+/)) {
                    if (/^timeline(__|--|$)/.test(classe)) {
                        infratores.push(`${caminho}: .${classe}`);
                    }
                }
            }
        }
        expect(infratores).toEqual([]);
    });

    it('o vocabulário do módulo é definido uma vez só no globals.css', () => {
        const duplicadas: string[] = [];
        for (const seletor of [
            'client-timeline',
            'client-timeline__item',
            'client-timeline__head',
            'client-timeline__title',
            'client-timeline__body',
            'kpi-grid--fluid',
        ]) {
            const regras = CSS.split('\n').filter(l =>
                new RegExp(`^\\.${seletor}\\s*\\{`).test(l.trim()),
            );
            if (regras.length !== 1) duplicadas.push(`.${seletor}: ${regras.length} regras`);
        }
        expect(duplicadas).toEqual([]);
    });
});
