/**
 * Defaults por provider — fonte única de verdade.
 * Usados apenas como fallback quando o banco retorna null
 * (ex: org recém-criada antes do primeiro save).
 */
export const AI_DEFAULT_MODELS = {
  openrouter: 'google/gemini-2.0-flash-001',
} as const;

export const AI_DEFAULT_PROVIDER = 'openrouter' as const;

/**
 * Modelo usado pro RAG (Google File Search Store, via @google/genai direto).
 * Formato é o nome nativo do Google ("gemini-2.0-flash"), NÃO o formato
 * "provider/model" da OpenRouter — RAG não passa pela OpenRouter.
 */
export const GOOGLE_RAG_MODEL = 'gemini-2.0-flash';
