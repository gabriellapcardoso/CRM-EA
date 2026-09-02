/**
 * Roda `tarefas` respeitando um limite de execuções simultâneas (issue #23, item 17).
 *
 * `Promise.allSettled(lista.map(...))` dispara TODAS as tarefas de uma vez. Pra
 * uma rota que faz uma chamada de IA + leituras no Supabase por item (ex.:
 * `ai-health`), isso significa que o número de chamadas simultâneas à
 * OpenRouter e ao pool de conexão do banco cresce junto com o número de itens
 * — sem limite. Rate limit do provider e contenção no pool viram backoff que
 * acumula tempo, e numa rota com `maxDuration` fixo o lote inteiro pode ser
 * cortado no meio sem nenhum registro do que ficou pra trás.
 *
 * Implementação de "pool de trabalhadores": `limite` trabalhadores concorrentes
 * consomem a fila em ordem; cada um pega o próximo item assim que termina o
 * anterior. Preserva a posição de cada resultado (`resultados[indice]`), igual
 * `Promise.allSettled` faria.
 */
export async function comLimiteDeConcorrencia<T>(
  tarefas: Array<() => Promise<T>>,
  limite: number,
): Promise<PromiseSettledResult<T>[]> {
  const resultados: PromiseSettledResult<T>[] = new Array(tarefas.length);
  let proximoIndice = 0;

  async function trabalhador(): Promise<void> {
    while (true) {
      const indice = proximoIndice;
      proximoIndice += 1;
      if (indice >= tarefas.length) return;

      try {
        const value = await tarefas[indice]();
        resultados[indice] = { status: 'fulfilled', value };
      } catch (reason) {
        resultados[indice] = { status: 'rejected', reason };
      }
    }
  }

  const numeroDeTrabalhadores = Math.max(1, Math.min(limite, tarefas.length));
  await Promise.all(Array.from({ length: numeroDeTrabalhadores }, () => trabalhador()));

  return resultados;
}
