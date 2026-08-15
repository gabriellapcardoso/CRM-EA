/**
 * @fileoverview Configuração de provedores de IA para o CRM.
 *
 * Este módulo abstrai a criação de clientes de diferentes provedores de IA.
 * Provider ativo: OpenRouter (roteador multi-modelo). `AIProvider` é um union
 * type deliberadamente extensível — hoje só tem 1 literal real, mas adicionar
 * um segundo provider no futuro não exige reescrever o tipo.
 *
 * @module services/ai/config
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from './defaults';

export type AIProvider = 'openrouter';

// Formato de modelo da OpenRouter é sempre "provider/model" (ex: google/gemini-2.0-flash-001,
// anthropic/claude-3.5-sonnet). Catálogo tem centenas de modelos e muda toda semana — uma
// allowlist fixa (padrão antigo do Gemini) ficaria desatualizada. Validamos só o formato;
// modelo inexistente é rejeitado pela própria API da OpenRouter com erro claro.
const OPENROUTER_MODEL_ID_PATTERN = /^[\w.-]+\/[\w.:-]+$/;

/**
 * Cria e retorna uma instância do modelo de IA configurada via OpenRouter.
 *
 * @param provider - Provedor de IA a ser utilizado (hoje só 'openrouter').
 * @param apiKey - Chave de API da OpenRouter.
 * @param modelId - ID do modelo no formato "provider/model" (ex: 'google/gemini-2.0-flash-001').
 *                  Se ausente ou com formato inválido, usa o modelo padrão.
 * @returns Instância configurada do modelo de IA.
 * @throws Error se a API key não for fornecida.
 *
 * @example
 * ```typescript
 * const model = getModel('openrouter', 'sua-api-key', 'anthropic/claude-3.5-sonnet');
 * ```
 */
export const getModel = (provider: AIProvider, apiKey: string, modelId: string) => {
    if (!apiKey) {
        throw new Error('API Key is missing');
    }

    // Nunca indexar AI_DEFAULT_MODELS[provider]: orgs criadas antes da migration pra
    // OpenRouter podem ter organization_settings.ai_provider = 'google' (valor antigo
    // ainda no banco) — indexar por esse valor stale retornaria undefined e quebraria
    // openrouter.chat(undefined) em runtime. Só existe 1 provider real hoje.
    const resolvedModel = modelId && OPENROUTER_MODEL_ID_PATTERN.test(modelId)
        ? modelId
        : AI_DEFAULT_MODELS.openrouter;

    const openrouter = createOpenRouter({ apiKey });
    return openrouter.chat(resolvedModel);
};

/**
 * Configuração de modelo para uso com env vars.
 */
export interface ModelConfig {
    provider?: AIProvider;
    model?: string;
}

/**
 * Retorna um modelo de IA usando variável de ambiente.
 *
 * Usa: OPENROUTER_API_KEY
 *
 * @param config - Configuração opcional (provider e model)
 * @returns Instância configurada do modelo de IA
 *
 * @example
 * ```typescript
 * const model = getModelFromEnv();
 * const model = getModelFromEnv({ model: 'anthropic/claude-3.5-sonnet' });
 * ```
 */
export const getModelFromEnv = (config?: ModelConfig) => {
    const model = config?.model || '';
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        throw new Error('API Key for openrouter not found in environment (OPENROUTER_API_KEY)');
    }

    return getModel(AI_DEFAULT_PROVIDER, apiKey, model);
};
