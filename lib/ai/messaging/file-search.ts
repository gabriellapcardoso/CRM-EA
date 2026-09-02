/**
 * Google GenAI File Search Store — RAG gerenciado.
 *
 * Usa @google/genai (não o Vercel AI SDK que não expõe File Search Tool).
 * O store é permanente: criado uma vez, reutilizado em todas as conversas.
 */

import { GoogleGenAI } from '@google/genai';

/**
 * Cria um File Search Store para um board.
 * Retorna o nome do store (ex: "fileSearchStores/xxx-yyy-zzz").
 */
export async function createFileSearchStore(
  apiKey: string,
  displayName: string,
): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  const store = await client.fileSearchStores.create({
    config: { displayName },
  });
  return store.name!;
}

/**
 * Faz upload de um arquivo para o store.
 */
export async function uploadToFileSearchStore(
  apiKey: string,
  storeId: string,
  file: Blob,
  mimeType: string,
): Promise<void> {
  const client = new GoogleGenAI({ apiKey });
  await client.fileSearchStores.uploadToFileSearchStore({
    fileSearchStoreName: storeId,
    file,
    config: { mimeType },
  });
}

/**
 * Chamada mínima pro caminho de RAG, só pra verificar que a chave (`ai_google_key`)
 * e o modelo nativo do Google ainda respondem — usada pelo health check
 * (`app/api/cron/ai-health/route.ts`). Issue #34, item 5.
 *
 * **Sem File Search Store de propósito.** O store é por board
 * (`board_ai_config.knowledge_store_id`) e nem toda org que configurou a chave
 * tem um; exigir store deixaria o check sem cobrir justamente quem ainda não
 * subiu documento. O que ESTA chamada pega é a classe de incidente de
 * 2026-09-01: chave revogada, cota estourada, modelo fora do catálogo — tudo
 * isso falha já aqui, antes de qualquer coisa de store.
 *
 * O que ela NÃO pega: store apagado ou inacessível numa org específica. Isso
 * exigiria um check por board, não por org — fica registrado como limitação
 * conhecida, não como esquecimento.
 */
export async function verificarCaminhoRAG({
  apiKey,
  model,
  timeoutMs,
}: {
  apiKey: string;
  model: string;
  timeoutMs: number;
}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: 'Responda: ok' }] }],
      config: {
        maxOutputTokens: 16,
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });

    // Mesma regra do check de chat: o que importa é a via ter respondido, não o
    // teor. Exigir texto específico transformaria variação normal de modelo em
    // alarme falso.
    const candidatos = response.candidates?.length ?? 0;
    if (candidatos === 0) {
      return { ok: false, motivo: 'RAG (Google File Search): modelo não devolveu nenhum candidato' };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, motivo: `RAG (Google File Search) falhou: ${msg.slice(0, 300)}` };
  }
}

/**
 * Gera uma resposta usando @google/genai com File Search Store ativo.
 * tools ficam em config.tools conforme GenerateContentParameters.
 */
export async function generateWithFileSearch({
  apiKey,
  model,
  systemPrompt,
  userMessage,
  storeId,
}: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  storeId: string;
}): Promise<{ text: string }> {
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: systemPrompt,
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: [storeId],
          },
        },
      ],
    },
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return { text };
}
