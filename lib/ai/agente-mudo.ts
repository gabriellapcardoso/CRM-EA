/**
 * @fileoverview Detecta a org configurada para responder que não consegue responder.
 *
 * Existe por causa de 2026-09-03. `ai_enabled` foi desligado em algum momento
 * da tarde; mensagens de leads continuaram entrando, contato e negócio
 * continuaram sendo criados, a conversa continuou aparecendo no inbox — e
 * ninguém respondeu, por horas. O único rastro era uma linha de log. Só
 * apareceu porque uma mensagem de teste foi mandada de propósito.
 *
 * O `ai-health` não pegava isso **por construção**: ele filtra
 * `ai_enabled = true`, então a org que desliga a IA some do health check. É o
 * mesmo ponto cego do watchdog de cron do mesmo dia — o vigia só enxerga quem
 * já se apresentou, e a ausência total não envelhece.
 *
 * ## Por que `agent_mode` entra junto
 *
 * `board_ai_config.agent_mode = 'observe'` produz exatamente o mesmo estado
 * observável: o agente gera a resposta, grava em `ai_conversation_log` com
 * `[DRY-RUN]`, e não envia. Aconteceu na mesma noite, horas depois, e segurou a
 * resposta de novo.
 *
 * Cobrir só `ai_enabled` seria repetir o erro que este projeto já cometeu: a
 * regra "health check tem que passar pelo caminho real" foi escrita pro
 * `ai-health` e não alcançou o `evolution-health`, que seguiu cego por cinco
 * semanas. Duas causas com o mesmo efeito e o mesmo silêncio se checam juntas.
 *
 * ## Por que o kill switch NÃO entra
 *
 * `whatsapp_kill_switch_active` também impede o envio, mas deixa rastro: a
 * mensagem fica `failed` na conversa, com o motivo escrito e um botão de
 * reenviar. É visível para quem abre o inbox. As duas causas cobertas aqui não
 * deixam nada — é essa a diferença que decide o que merece alerta.
 *
 * @module lib/ai/agente-mudo
 */

export interface EntradaDeSilencio {
  /** `organization_settings.ai_enabled`. */
  aiEnabled: boolean;
  /** Ids dos boards que têm ao menos um estágio com IA habilitada. */
  boardsComEstagioHabilitado: string[];
  /** `board_ai_config.agent_mode` por board. Ausente = sem linha = envia. */
  agentModePorBoard: Record<string, string | null | undefined>;
}

/**
 * Motivos pelos quais a org está configurada para responder e não responde.
 *
 * Lista vazia significa que nada bloqueia — não que esteja tudo perfeito, só
 * que nenhuma das causas silenciosas conhecidas se aplica.
 */
export function motivosDeSilencio(entrada: EntradaDeSilencio): string[] {
  const motivos: string[] = [];

  // Sem estágio habilitado, a org não configurou o agente para responder. Isso
  // é ausência de configuração, não falha, e alertar seria ruído — mesma regra
  // que o filtro de orgs elegíveis do ai-health já aplica.
  if (entrada.boardsComEstagioHabilitado.length === 0) return motivos;

  if (!entrada.aiEnabled) {
    motivos.push(
      'ai_enabled está desligado na organização (Configurações → Central de IA) — isso cala o agente de WhatsApp junto com o chat do CRM',
    );
  }

  const boardsEmObserve = entrada.boardsComEstagioHabilitado.filter(
    (boardId) => entrada.agentModePorBoard[boardId] === 'observe',
  );

  if (boardsEmObserve.length > 0) {
    motivos.push(
      `${boardsEmObserve.length} board(s) com estágio de IA habilitado estão em agent_mode "observe" — o agente gera a resposta e não envia (Central de IA → agentes por board)`,
    );
  }

  return motivos;
}

/**
 * Severidade do alerta.
 *
 * Primeira detecção é `info`: pode ser alguém pausando por uma hora, e gritar
 * nesse caso treina a pessoa a ignorar o alerta. Persistindo além da janela,
 * vira `critical` — um dia inteiro nesse estado não é pausa, é lead entrando e
 * ninguém respondendo. Mesmo formato de escalonamento que o check vizinho no
 * `ai-health` já usa para duas falhas consecutivas.
 */
export function severidadeDoSilencio(jaAlertadoNaJanela: boolean): 'info' | 'critical' {
  return jaAlertadoNaJanela ? 'critical' : 'info';
}
