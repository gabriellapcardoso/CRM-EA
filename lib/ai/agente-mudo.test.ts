/**
 * Guardas do detector de "configurado pra responder, mas mudo".
 *
 * Os dois casos reais de 2026-09-03, que produziram exatamente o mesmo estado
 * observável — mensagem entra, contato e negócio são criados, conversa aparece
 * no inbox, ninguém responde:
 *
 * 1. `ai_enabled` desligado na organização, por horas.
 * 2. `agent_mode: 'observe'` no board, algumas horas depois.
 *
 * O detector cobre os dois porque cobrir só um repetiria o erro que este
 * projeto já cometeu: a regra de health check escrita pro `ai-health` não
 * alcançou o `evolution-health`, que ficou cego cinco semanas.
 */
import { describe, expect, it } from 'vitest';
import { motivosDeSilencio, severidadeDoSilencio } from './agente-mudo';

const BOARD = 'board-negociacao';

function entrada(over: Partial<Parameters<typeof motivosDeSilencio>[0]> = {}) {
  return {
    aiEnabled: true,
    boardsComEstagioHabilitado: [BOARD],
    agentModePorBoard: { [BOARD]: 'respond' },
    ...over,
  };
}

describe('motivosDeSilencio', () => {
  it('org saudável não gera motivo nenhum', () => {
    expect(motivosDeSilencio(entrada())).toEqual([]);
  });

  it('pega ai_enabled desligado — o caso da tarde de 2026-09-03', () => {
    const motivos = motivosDeSilencio(entrada({ aiEnabled: false }));

    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain('ai_enabled');
    // O alerta tem que dizer ONDE arrumar, senão vira "algo está errado".
    expect(motivos[0]).toContain('Central de IA');
  });

  it('pega agent_mode observe — o caso da noite, mesmo sintoma', () => {
    const motivos = motivosDeSilencio(entrada({ agentModePorBoard: { [BOARD]: 'observe' } }));

    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain('observe');
    expect(motivos[0]).toContain('agentes por board');
  });

  it('acumula os dois quando os dois estão errados', () => {
    const motivos = motivosDeSilencio(
      entrada({ aiEnabled: false, agentModePorBoard: { [BOARD]: 'observe' } }),
    );

    expect(motivos).toHaveLength(2);
  });

  it('board sem linha em board_ai_config não conta como observe — sem linha o agente ENVIA', () => {
    // `isDryRun` é `agent_mode === 'observe'`; ausência de linha dá undefined,
    // que é falso. Tratar ausente como observe geraria alerta em org que está
    // funcionando.
    expect(motivosDeSilencio(entrada({ agentModePorBoard: {} }))).toEqual([]);
    expect(motivosDeSilencio(entrada({ agentModePorBoard: { [BOARD]: null } }))).toEqual([]);
  });

  it('sem estágio habilitado não alerta nada — é ausência de uso, não falha', () => {
    // Mesma regra do filtro de orgs elegíveis do ai-health: não usar o agente é
    // legítimo, e alertar sobre isso seria ruído puro.
    expect(
      motivosDeSilencio({
        aiEnabled: false,
        boardsComEstagioHabilitado: [],
        agentModePorBoard: { [BOARD]: 'observe' },
      }),
    ).toEqual([]);
  });

  it('só conta observe em board que tem estágio habilitado', () => {
    // Pós-venda em observe sem estágio habilitado é o estado real e correto da
    // aaagência — não pode gerar alerta.
    const motivos = motivosDeSilencio({
      aiEnabled: true,
      boardsComEstagioHabilitado: [BOARD],
      agentModePorBoard: { [BOARD]: 'respond', 'board-pos-venda': 'observe' },
    });

    expect(motivos).toEqual([]);
  });
});

describe('severidadeDoSilencio', () => {
  it('primeira detecção é info — pode ser pausa deliberada de uma hora', () => {
    expect(severidadeDoSilencio(false)).toBe('info');
  });

  it('persistindo além da janela vira critical — um dia assim não é pausa', () => {
    expect(severidadeDoSilencio(true)).toBe('critical');
  });
});
