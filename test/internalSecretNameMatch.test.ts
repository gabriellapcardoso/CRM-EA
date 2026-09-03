/**
 * Amarra os dois lados da chamada interna que aciona o agente de IA.
 *
 * Quem chama é a Edge Function `messaging-webhook-evolution` (Deno, lê
 * `Deno.env`); quem valida é `app/api/messaging/ai/process` (Node, lê
 * `process.env`). Os dois liam nomes DIFERENTES do mesmo segredo, e o nome que
 * ambos liam (`INTERNAL_API_SECRET`) não existia em ambiente nenhum — nem nos
 * secrets do Supabase, nem na Vercel.
 *
 * O efeito, medido em 2026-09-03 com a primeira mensagem real de WhatsApp: o
 * contato foi criado, o negócio foi criado, e o agente de IA nunca foi
 * acionado. O único sinal era um `console.warn` numa função que ninguém lê.
 * Um nome que só o código conhece é indistinguível de uma feature desligada.
 *
 * Este teste falha se os dois lados voltarem a divergir. Não pode conferir se o
 * segredo ESTÁ setado (isso é ambiente, não código), mas garante que os dois
 * procuram a mesma coisa — que era o defeito real.
 *
 * Comentários são removidos antes de casar: teste que lê arquivo tem que ler
 * código, senão a prosa explicando o conserto vira a prova dele. Ver
 * `DESAFIOS.md`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const EDGE = semComentarios(
  readFileSync(join(RAIZ, 'supabase/functions/messaging-webhook-evolution/index.ts'), 'utf8'),
);
const ROTA = semComentarios(
  readFileSync(join(RAIZ, 'app/api/messaging/ai/process/route.ts'), 'utf8'),
);

/** Nome canônico, e o único confirmado presente nos secrets do projeto. */
const CANONICO = 'CRM_EA_INTERNAL_WEBHOOK_SECRET';

describe('segredo da chamada interna que aciona a IA', () => {
  it('a Edge Function lê o nome canônico', () => {
    expect(EDGE).toContain(`Deno.env.get("${CANONICO}")`);
  });

  it('a rota que valida lê o mesmo nome canônico', () => {
    expect(ROTA).toContain(`process.env.${CANONICO}`);
  });

  it('a Edge Function monta a URL da app pelo nome canônico', () => {
    expect(EDGE).toContain('Deno.env.get("CRM_EA_APP_URL")');
  });

  it('segredo ausente é console.error, não warn — a IA muda não tem outro sinal', () => {
    const bloco = EDGE.slice(EDGE.indexOf('async function triggerAIProcessing'));
    const ateOFim = bloco.slice(0, bloco.indexOf('\nasync function ') + 1 || undefined);
    expect(ateOFim).toMatch(/console\.error\([\s\S]*?CRM_EA_INTERNAL_WEBHOOK_SECRET/);
    expect(ateOFim).not.toMatch(/console\.warn\([\s\S]*?INTERNAL_API_SECRET/);
  });
});
