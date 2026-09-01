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
 * Ao trocar este valor, trocar TAMBÉM `organization_settings.ai_model` no banco
 * de cada org — este default só alcança org nova, porque `settings.ts` grava a
 * string no banco na criação e é de lá que a config é lida depois.
 */
export const AI_DEFAULT_MODELS = {
  openrouter: 'deepseek/deepseek-v4-flash',
} as const;

export const AI_DEFAULT_PROVIDER = 'openrouter' as const;

/**
 * Modelo usado pro RAG (Google File Search Store, via @google/genai direto).
 * Formato é o nome nativo do Google ("gemini-2.0-flash"), NÃO o formato
 * "provider/model" da OpenRouter — RAG não passa pela OpenRouter.
 */
export const GOOGLE_RAG_MODEL = 'gemini-2.0-flash';
