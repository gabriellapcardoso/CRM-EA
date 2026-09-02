import { generateText, Output } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { AnalyzeLeadInputSchema, AnalyzeLeadOutputSchema } from '@/lib/ai/tasks/schemas';
import { getResolvedPrompt } from '@/lib/ai/prompts/server';
import { renderPromptTemplate } from '@/lib/ai/prompts/render';
import { isAIFeatureEnabled } from '@/lib/ai/features/server';
import { SECURITY_PREAMBLE } from '@/lib/ai/agent/agent.service';
import { sanitizeIncomingMessage } from '@/lib/ai/agent/input-filter';

export const maxDuration = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
  try {
    const { model, supabase, organizationId, modelId } = await requireAITaskContext(req);
    const enabled = await isAIFeatureEnabled(supabase as any, organizationId, 'ai_deal_analyze');
    if (!enabled) {
      return json({ error: { code: 'AI_FEATURE_DISABLED', message: 'Função de IA desativada: Análise de deal.' } }, 403);
    }

    const body = await req.json().catch(() => null);
    const { deal, stageLabel } = AnalyzeLeadInputSchema.parse(body);

    const value = deal?.value ?? 0;
    const formattedValue = typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value);

    const { text: safeTitle } = sanitizeIncomingMessage(String(deal?.title || ''), { org_id: organizationId });

    const resolved = await getResolvedPrompt(supabase, organizationId, 'task_deals_analyze');
    const prompt = renderPromptTemplate(resolved?.content || '', {
      dealTitle: safeTitle,
      dealValue: formattedValue,
      stageLabel: stageLabel || deal?.status || '',
      probability: deal?.probability || 50,
    });

    const result = await generateText({
      model,
      system: SECURITY_PREAMBLE,
      maxRetries: 3,
      output: Output.object({ schema: AnalyzeLeadOutputSchema }),
      prompt,
    });

    // Modelo que RESPONDEU, não o pedido: se o failover nativo da OpenRouter
    // (lib/ai/config.ts, extraBody.models) resgatar a chamada com outro
    // modelo, `model_used` continuava afirmando o modelo configurado —
    // exatamente o dado que se quer conferir depois de um incidente, falso
    // justamente durante o incidente. `result.response?.modelId` ausente cai
    // no modelo pedido, pra nunca gravar a coluna vazia. Issue #23, item 8.
    const modeloQueRespondeu = result.response?.modelId || modelId;

    void (supabase as any).from('ai_conversation_log').insert({
      organization_id: organizationId,
      ai_response: '',
      tokens_used: result.usage?.totalTokens ?? 0,
      model_used: modeloQueRespondeu,
      action_taken: 'analyze_lead',
      context_snapshot: {},
    }).then(({ error }: { error: unknown }) => {
      if (error) console.error('[AI] log failed:', error);
    });

    return json(result.output);
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/deals/analyze] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao executar tarefa de IA.' } }, 500);
  }
}
