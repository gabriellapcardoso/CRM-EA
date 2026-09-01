/**
 * Defaults por provider — fonte única de verdade.
 * Usados apenas como fallback quando o banco retorna null
 * (ex: org recém-criada antes do primeiro save).
 */
/**
 * `google/gemini-2.0-flash-001` foi REMOVIDO do catálogo da OpenRouter e passou
 * a responder 404 "No endpoints found" (achado em 2026-09-01 pelo /qa, com toda
 * a camada de IA do CRM fora do ar: agente do WhatsApp, análise de deal,
 * briefing, cron de estágios — 17 arquivos).
 *
 * Requisitos do substituto, não negociáveis: `tools` (o agente usa) e
 * `structured_outputs` (todas as tarefas usam `Output.object({ schema })`).
 *
 * Id DATADO (`-0731`), não o alias `deepseek/deepseek-v4-flash`: alias aponta
 * sempre pra versão corrente e pode mudar de comportamento — ou sumir — sem
 * aviso, que é exatamente o que acabou de derrubar a IA inteira. Versão datada
 * fica parada até alguém decidir subir. De quebra, custa menos por token de
 * entrada (US$ 0,065/M contra 0,079/M).
 *
 * Ao trocar este valor, trocar TAMBÉM `organization_settings.ai_model` no banco
 * de cada org — este default só alcança org nova, porque `settings.ts` grava a
 * string no banco na criação e é de lá que a config é lida depois.
 */
export const AI_DEFAULT_MODELS = {
  openrouter: 'deepseek/deepseek-v4-flash-0731',
} as const;

/**
 * Modelos de reserva, em ordem de prioridade, enviados no parâmetro `models`
 * da OpenRouter. Quando o modelo primário falha (404 de modelo removido, provider
 * fora do ar, rate limit), a OpenRouter tenta estes na sequência **dentro da
 * mesma requisição** — o app não vê erro nenhum.
 *
 * Isto existe porque em 2026-09-01 o modelo primário sumiu do catálogo e toda a
 * camada de IA caiu junto: 17 arquivos, incluindo o agente que negocia no
 * WhatsApp. Um único id de modelo era ponto único de falha para o produto
 * inteiro.
 *
 * Escolha da lista, na ordem:
 * 1. o alias móvel da mesma família — cobre "a versão datada saiu do catálogo",
 *    que é exatamente o que aconteceu;
 * 2. um modelo de OUTRA família/fabricante — cobre "a DeepSeek inteira está
 *    fora do ar". Dois modelos do mesmo fornecedor cairiam juntos e a lista não
 *    teria servido pra nada.
 *
 * Requisito de todos: `tools` e `structured_outputs`, senão o agente e as
 * tarefas com `Output.object({ schema })` quebram justamente durante o
 * incidente em que o fallback deveria estar salvando.
 */
export const AI_FALLBACK_MODELS = [
  'deepseek/deepseek-v4-flash',
  'google/gemini-3.5-flash-lite',
] as const;

export const AI_DEFAULT_PROVIDER = 'openrouter' as const;

/**
 * Modelo usado pro RAG (Google File Search Store, via @google/genai direto).
 * Formato é o nome nativo do Google ("gemini-2.0-flash"), NÃO o formato
 * "provider/model" da OpenRouter — RAG não passa pela OpenRouter.
 */
export const GOOGLE_RAG_MODEL = 'gemini-2.0-flash';
