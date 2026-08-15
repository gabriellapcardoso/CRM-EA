import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AI_DEFAULT_MODELS } from './defaults';

/**
 * Creates an OpenRouter provider with the given API key.
 * This allows for dynamic API key configuration per request,
 * since the key is stored in the database per organization.
 * @deprecated Prefer importing `getModel` from `@/lib/ai/config` directly.
 */
export function createProvider(apiKey: string) {
    return createOpenRouter({ apiKey });
}

/**
 * Default model to use for the CRM assistant.
 * @deprecated Prefer importing from `@/lib/ai/defaults` directly.
 */
export const DEFAULT_MODEL = AI_DEFAULT_MODELS.openrouter;
