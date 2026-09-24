/**
 * Teto de tokens baixo em chamada de IA é alarme falso esperando acontecer.
 *
 * `maxOutputTokens` limita a saída INTEIRA, e modelos de raciocínio gastam
 * parte dela pensando antes de escrever. Estourado, o conteúdo volta vazio com
 * `finish_reason: "length"` e o AI SDK levanta `No output generated.` — que o
 * health check reporta como "IA fora do ar".
 *
 * Isso já custou duas rodadas. O teto era 5, o DeepSeek consumia tudo no
 * raciocínio, e o conserto foi subir pra 64; em 2026-09-24 o mesmo defeito
 * tinha produzido **182 falhas em 7 dias (27% das execuções) e 57 e-mails
 * críticos**, com a IA saudável o tempo todo.
 *
 * Subir o número não resolve porque a variável não é o modelo: a OpenRouter
 * sorteia um PROVEDOR por chamada, e o mesmo `deepseek/deepseek-v4-flash-0731`
 * gastou 7 tokens pela DeepInfra e 64 pela Sail Research no mesmo prompt
 * (medido: 8 chamadas, 1 truncou). Contra sorteio não existe número seguro —
 * existe não ter teto, que é o que as 17 chamadas reais da aplicação fazem.
 *
 * Esta guarda é estática porque o bug é invisível em teste: mock não gasta
 * token de raciocínio, e o CI nunca chama provedor de verdade.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Abaixo disto, raciocínio de modelo real cabe sem folga nenhuma. */
const PISO_SEGURO = 512;

const RAIZES = ['lib/ai', 'app/api'];

function arquivosTs(dir: string, acc: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) {
            arquivosTs(caminho, acc);
        } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
            acc.push(caminho);
        }
    }
    return acc;
}

function semComentarios(fonte: string): string {
    return fonte
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(l => l.replace(/^\s*\/\/.*$/, ''))
        .join('\n');
}

const RAIZ = process.cwd();

/**
 * Corpo de uma função, do nome dela até a próxima declaração de topo.
 *
 * `/nome\([\s\S]*?\n\}/` NÃO serve: o não-guloso para no primeiro `\n}`, que
 * numa assinatura com parâmetro desestruturado é o fecho do OBJETO DE
 * PARÂMETROS, não o da função. A primeira versão desta guarda caiu nisso e
 * afirmou coisas sobre 40 caracteres de assinatura. Ver `DESAFIOS.md`.
 */
function corpoDaFuncao(fonte: string, nome: string): string | undefined {
    const inicio = fonte.search(new RegExp(`function ${nome}\\b`));
    if (inicio < 0) return undefined;
    const resto = fonte.slice(inicio);
    // Próxima declaração começando na coluna 0 depois desta.
    const fim = resto.slice(1).search(/\n(export |async function |function |const |class )/);
    return fim < 0 ? resto : resto.slice(0, fim + 1);
}

/** Todo `maxOutputTokens: <número>` literal do código de IA, com onde está. */
function tetosDeclarados(): { arquivo: string; valor: number }[] {
    const achados: { arquivo: string; valor: number }[] = [];
    for (const raiz of RAIZES) {
        for (const arquivo of arquivosTs(join(RAIZ, raiz))) {
            const fonte = semComentarios(readFileSync(arquivo, 'utf-8'));
            for (const m of fonte.matchAll(/maxOutputTokens\s*:\s*(\d+)/g)) {
                achados.push({ arquivo: relative(RAIZ, arquivo), valor: Number(m[1]) });
            }
        }
    }
    return achados;
}

describe('orçamento de tokens das chamadas de IA', () => {
    it('nenhuma chamada de IA corta a saída abaixo do piso seguro', () => {
        const baixos = tetosDeclarados().filter(t => t.valor < PISO_SEGURO);
        expect(
            baixos,
            `teto de saída abaixo de ${PISO_SEGURO} em: ` +
                baixos.map(b => `${b.arquivo} (${b.valor})`).join(', ') +
                '. O orçamento é dividido com o raciocínio do modelo — estourá-lo ' +
                'devolve resposta vazia, que o health check lê como "IA fora do ar".',
        ).toEqual([]);
    });

    it('a sonda de chat do ai-health não põe teto', () => {
        // Ela existe pra exercitar o caminho real, e o caminho real não tem
        // teto. Um limite que só o vigia tem faz o vigia falhar sozinho.
        const fonte = semComentarios(
            readFileSync(join(RAIZ, 'app/api/cron/ai-health/route.ts'), 'utf-8'),
        );
        const bloco = corpoDaFuncao(fonte, 'checarIA');
        expect(bloco, 'função checarIA não encontrada').toBeDefined();
        expect(bloco).toContain('generateText');
        expect(bloco).not.toContain('maxOutputTokens');
    });

    it('a sonda de RAG não põe teto', () => {
        const fonte = semComentarios(
            readFileSync(join(RAIZ, 'lib/ai/messaging/file-search.ts'), 'utf-8'),
        );
        const bloco = corpoDaFuncao(fonte, 'verificarCaminhoRAG');
        expect(bloco, 'função verificarCaminhoRAG não encontrada').toBeDefined();
        expect(bloco).toContain('generateContent');
        expect(bloco).not.toContain('maxOutputTokens');
    });

    it('a busca cobre os dois arquivos que já tiveram o defeito', () => {
        // Sem isto, um erro de caminho faria as asserções acima passarem por
        // vacuidade sobre uma lista vazia — o modo de falha registrado no
        // DESAFIOS.md ("asserção de ausência sobre alvo errado é sempre verde").
        const varridos = RAIZES.flatMap(r => arquivosTs(join(RAIZ, r))).map(f => relative(RAIZ, f));
        expect(varridos).toContain('app/api/cron/ai-health/route.ts');
        expect(varridos).toContain('lib/ai/messaging/file-search.ts');
        expect(varridos.length).toBeGreaterThan(20);
    });
});
