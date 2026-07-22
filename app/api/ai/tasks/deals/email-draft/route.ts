import { generateText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateEmailDraftInputSchema } from '@/lib/ai/tasks/schemas';
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
    const { model, supabase, organizationId } = await requireAITaskContext(req);
    const enabled = await isAIFeatureEnabled(supabase as any, organizationId, 'ai_email_draft');
    if (!enabled) {
      return json({ error: { code: 'AI_FEATURE_DISABLED', message: 'Função de IA desativada: Rascunho de e-mail.' } }, 403);
    }

    const body = await req.json().catch(() => null);
    const { deal } = GenerateEmailDraftInputSchema.parse(body);

    const { text: safeContactName } = sanitizeIncomingMessage(String(deal?.contactName || 'Cliente'), { org_id: organizationId });
    const { text: safeCompanyName } = sanitizeIncomingMessage(String(deal?.companyName || 'Empresa'), { org_id: organizationId });
    const { text: safeTitle } = sanitizeIncomingMessage(String(deal?.title || ''), { org_id: organizationId });

    const resolved = await getResolvedPrompt(supabase, organizationId, 'task_deals_email_draft');
    const prompt = renderPromptTemplate(resolved?.content || '', {
      contactName: safeContactName,
      companyName: safeCompanyName,
      dealTitle: safeTitle,
    });

    const result = await generateText({
      model,
      system: SECURITY_PREAMBLE,
      maxRetries: 3,
      prompt,
    });

    return json({ text: result.text });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/deals/email-draft] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar rascunho de e-mail.' } }, 500);
  }
}
