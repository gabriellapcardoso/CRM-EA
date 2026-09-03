/**
 * Amarra `handleConnectionUpdate` (Edge Function) ao consumidor do campo que
 * ela grava — dois arquivos que ninguém lê junto.
 *
 * `getActiveChannelForOrg()` escolhe por qual canal a proposta automática sai
 * usando `order by last_connected_at desc`. O scan do QR não passa pela rota do
 * app: quem marca o canal como `connected` é o `connection.update` que chega no
 * webhook. Se esse caminho não grava `last_connected_at`, um canal recém-pareado
 * fica com o timestamp antigo e perde a escolha pra um canal velho que já não
 * funciona — o caso de migração de instância que a docstring daquela função diz
 * cobrir.
 *
 * Achado ao vivo em 2026-09-03: canal `connected` às 17:05 com
 * `last_connected_at` em 31/08.
 *
 * Teste por leitura de arquivo porque a Edge Function é Deno e importa
 * `npm:@supabase/supabase-js` — o vitest não carrega o módulo. Mesmo padrão de
 * `vercelCronLimit.test.ts` e `cronHeartbeatCoverage.test.ts`.
 *
 * Comentários são removidos ANTES de casar. A primeira versão deste arquivo
 * passava com a regressão injetada, porque casava com `last_connected_at`
 * escrito no comentário que eu tinha acabado de pôr ao lado da linha. Teste que
 * lê arquivo tem que ler CÓDIGO — senão a documentação do próprio conserto vira
 * a prova de que o conserto existe.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const EDGE = readFileSync(
  join(RAIZ, 'supabase/functions/messaging-webhook-evolution/index.ts'),
  'utf8',
);
const CONSUMIDOR = readFileSync(join(RAIZ, 'lib/messaging/get-active-channel.ts'), 'utf8');

/** Remove comentários de linha e de bloco, deixando só código. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const EDGE_CODIGO = semComentarios(EDGE);

/** Corpo de `handleConnectionUpdate`, do cabeçalho até a próxima função. */
function blocoConnectionUpdate(): string {
  const EDGE = EDGE_CODIGO;
  const inicio = EDGE.indexOf('async function handleConnectionUpdate');
  expect(inicio, 'handleConnectionUpdate não encontrada na Edge Function').toBeGreaterThan(-1);
  const resto = EDGE.slice(inicio + 1);
  const fim = resto.indexOf('\nasync function ');
  return fim === -1 ? resto : resto.slice(0, fim);
}

describe('connection.update grava os timestamps que outros módulos leem', () => {
  it('grava last_connected_at ao marcar o canal como connected', () => {
    const bloco = blocoConnectionUpdate();

    expect(bloco).toContain('last_connected_at');
    // Dentro do ramo de connected, não solto em qualquer transição: marcar
    // "conectou agora" ao receber um `close` seria pior que não marcar.
    const ramoConnected = bloco.slice(bloco.indexOf('if (newStatus === "connected")'));
    expect(ramoConnected).toContain('last_connected_at');
  });

  it('grava updated_at em toda transição de status', () => {
    expect(blocoConnectionUpdate()).toContain('updated_at');
  });

  it('o consumidor realmente ordena por last_connected_at — se isso mudar, este teste perde o sentido', () => {
    const codigo = semComentarios(CONSUMIDOR);
    expect(codigo).toMatch(/order\(\s*['"]last_connected_at['"]/);
  });

  it('o próprio teste ignora comentários — guarda contra a versão falsa que já escrevi', () => {
    expect(semComentarios('// last_connected_at\nconst x = 1;')).not.toContain('last_connected_at');
    expect(semComentarios('/* last_connected_at */\nconst x = 1;')).not.toContain('last_connected_at');
  });
});
