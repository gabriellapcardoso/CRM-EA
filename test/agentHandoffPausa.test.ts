/**
 * Handoff tem que calar o agente na conversa.
 *
 * `handleHandoff` marcava `ai_handoff_pending: true`, registrava atividade no
 * deal e avisava o time por Realtime. E `ai_handoff_pending` era lido em
 * NENHUM lugar do repositório: na mensagem seguinte o agente respondia de novo,
 * por cima da pessoa que tinha acabado de assumir. Quem pedia "falar com um
 * atendente" seguia conversando com a IA.
 *
 * O campo que o guard de entrada consulta é `ai_paused` (início de
 * `processIncomingMessage`). O conserto é o handoff gravar esse, em vez de
 * inventar um segundo caminho de pausa — dois flags com o mesmo significado
 * divergem na primeira vez que alguém mexer em um só.
 *
 * Teste por leitura de arquivo, com comentários removidos antes de casar:
 * `agent.service.ts` puxa OpenRouter, Supabase e o roteador de canais, e montar
 * tudo isso pra checar duas chaves de um objeto custa mais do que protege. Ver
 * `DESAFIOS.md`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(join(process.cwd(), 'lib/ai/agent/agent.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

/** Corpo de `handleHandoff`, do cabeçalho até a próxima função. */
function blocoHandoff(): string {
  const inicio = FONTE.indexOf('async function handleHandoff');
  expect(inicio, 'handleHandoff não encontrada').toBeGreaterThan(-1);
  const resto = FONTE.slice(inicio + 1);
  const fim = resto.search(/\n(async )?function /);
  return fim === -1 ? resto : resto.slice(0, fim);
}

describe('handoff pausa o agente na conversa', () => {
  it('o handoff grava ai_paused, não só ai_handoff_pending', () => {
    const bloco = blocoHandoff();

    expect(bloco).toContain('ai_handoff_pending: true');
    expect(bloco, 'sem ai_paused o agente volta a responder na mensagem seguinte').toContain(
      'ai_paused: true',
    );
  });

  it('o guard de entrada realmente consulta ai_paused — se isso mudar, o conserto perde efeito', () => {
    expect(FONTE).toMatch(/conversationMetadata\.ai_paused\s*===\s*true/);
  });

  it('o handoff não manda mensagem nenhuma pro lead', () => {
    const bloco = blocoHandoff();

    // A transferência é silenciosa por decisão de produto: o lead não deve
    // perceber que saiu do agente. Se algum dia isso enviar mensagem, é mudança
    // de comportamento com cliente, não refactor.
    expect(bloco).not.toMatch(/sendMessage|enviarResposta|router\.send/);
  });

  it('o handoff avisa o time — silencioso pro lead não é silencioso pra dentro', () => {
    const bloco = blocoHandoff();

    expect(bloco).toContain('ai_handoff');
    expect(bloco).toMatch(/deal_activities|broadcast/);
  });
});
