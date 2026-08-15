/**
 * @fileoverview AI Models API
 *
 * Retorna a lista de modelos disponíveis na OpenRouter — catálogo público,
 * não exige chave de API pra listar (só pra usar o modelo no chat/agente).
 *
 * @module app/api/ai/models/route
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

// =============================================================================
// Types
// =============================================================================

export interface AIModelInfo {
  id: string;
  name: string;
  provider: 'openrouter';
  /** OpenRouter não tem conceito de alias auto-atualizado — sempre false. */
  isAlias: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function fetchOpenRouterModels(): Promise<AIModelInfo[]> {
  // Catálogo público — não requer Authorization (só a chamada de chat exige a chave).
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter API error: HTTP ${res.status}`);

  const data = await res.json() as { data?: Array<{ id: string; name?: string }> };

  return (data.data ?? [])
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      provider: 'openrouter' as const,
      isAlias: false,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// =============================================================================
// GET /api/ai/models
// =============================================================================

export async function GET(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'Não autenticado' }, 401);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return json({ models: [] });
  }

  try {
    const models = await fetchOpenRouterModels();
    return json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error(`[api/ai/models] ${message}`);
    return json({ error: `Falha ao buscar modelos: ${message}` }, 502);
  }
}
