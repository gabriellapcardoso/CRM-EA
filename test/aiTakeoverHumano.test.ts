/**
 * Guardas do incidente de 06/09/2026: a IA entrou no meio de uma negociação de
 * três dias já fechada e perguntou ao lead se ele tinha "revisado o pacote".
 *
 * Três falhas empilhadas, todas cobertas aqui:
 *
 * 1. o bloco de takeover só rodava `if (takeoverEnabled && assigned_user_id)`, e
 *    `assigned_user_id` só é preenchido pelo compositor do CRM — a equipe
 *    responde pelo WhatsApp do celular, então o campo era sempre nulo e a
 *    guarda era código morto;
 * 2. a checagem procurava `sender_type = 'user'`, valor que só a rota de envio
 *    do CRM escreve. O webhook não gravava `sender_type` nenhum, e o banco
 *    tinha ZERO linhas com esse valor;
 * 3. o webhook dispara o processamento por mensagem recebida, então uma rajada
 *    do lead virava uma resposta por mensagem.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    humanoJaAtendeuAConversa,
    iaRespondeuHaPoucosSegundos,
} from '@/lib/ai/agent/agent.service';

const CONVERSA = 'conv-001';

/** Devolve o que a consulta encadeada resolveria, registrando os filtros. */
function supabaseComMensagens(resultado: { data: unknown[] | null; error: unknown }) {
    const filtros: { metodo: string; args: unknown[] }[] = [];
    const qb: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'or', 'gte', 'limit']) {
        qb[m] = vi.fn((...args: unknown[]) => {
            filtros.push({ metodo: m, args });
            return m === 'limit' ? Promise.resolve(resultado) : qb;
        });
    }
    return {
        cliente: { from: vi.fn(() => qb) } as never,
        filtros,
    };
}

describe('humanoJaAtendeuAConversa', () => {
    it('mensagem de saída com sender_type nulo conta como humano', async () => {
        // É assim que chega tudo que a equipe manda do próprio WhatsApp — o
        // caso exato que a regra antiga não enxergava.
        const { cliente } = supabaseComMensagens({ data: [{ id: 'm1' }], error: null });
        await expect(humanoJaAtendeuAConversa(cliente, CONVERSA)).resolves.toBe(true);
    });

    it('conversa só com mensagens da IA não conta como atendida por humano', async () => {
        const { cliente } = supabaseComMensagens({ data: [], error: null });
        await expect(humanoJaAtendeuAConversa(cliente, CONVERSA)).resolves.toBe(false);
    });

    it('falha de leitura cala a IA em vez de liberar', async () => {
        // Silêncio indevido custa uma resposta atrasada; o oposto custa o lead.
        const { cliente } = supabaseComMensagens({ data: null, error: { message: 'timeout' } });
        await expect(humanoJaAtendeuAConversa(cliente, CONVERSA)).resolves.toBe(true);
    });

    it('não filtra por sender_type igual a user', async () => {
        // A regressão original: só `= 'user'` casava, e nenhuma linha do banco
        // tinha esse valor.
        const { cliente, filtros } = supabaseComMensagens({ data: [], error: null });
        await humanoJaAtendeuAConversa(cliente, CONVERSA);

        const igualdades = filtros.filter(f => f.metodo === 'eq');
        expect(igualdades.some(f => f.args[0] === 'sender_type' && f.args[1] === 'user')).toBe(false);
        expect(igualdades.some(f => f.args[0] === 'direction' && f.args[1] === 'outbound')).toBe(true);

        // E precisa alcançar explicitamente a linha de sender_type nulo: um
        // `not.in` sozinho não casa NULL em SQL.
        const ors = filtros.filter(f => f.metodo === 'or');
        expect(ors).toHaveLength(1);
        expect(String(ors[0].args[0])).toContain('sender_type.is.null');
    });
});

describe('iaRespondeuHaPoucosSegundos', () => {
    it('resposta recente da IA bloqueia a próxima da rajada', async () => {
        const { cliente } = supabaseComMensagens({ data: [{ id: 'm1' }], error: null });
        await expect(iaRespondeuHaPoucosSegundos(cliente, CONVERSA)).resolves.toBe(true);
    });

    it('sem resposta recente, a IA segue livre', async () => {
        const { cliente } = supabaseComMensagens({ data: [], error: null });
        await expect(iaRespondeuHaPoucosSegundos(cliente, CONVERSA)).resolves.toBe(false);
    });

    it('olha só mensagem da própria IA, com corte de tempo', async () => {
        const { cliente, filtros } = supabaseComMensagens({ data: [], error: null });
        await iaRespondeuHaPoucosSegundos(cliente, CONVERSA);

        const igualdades = filtros.filter(f => f.metodo === 'eq');
        expect(igualdades.some(f => f.args[0] === 'sender_type' && f.args[1] === 'ai')).toBe(true);
        expect(filtros.some(f => f.metodo === 'gte' && f.args[0] === 'created_at')).toBe(true);
    });
});

// -----------------------------------------------------------------------------
// Guardas estáticas. Comentários removidos antes de casar: os desta mudança
// citam `assigned_user_id` e `sender_type` em prosa, e a asserção casaria neles
// com a mesma facilidade que no código.
// -----------------------------------------------------------------------------

function semComentarios(caminho: string): string {
    return readFileSync(join(process.cwd(), caminho), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(l => l.replace(/\/\/.*$/, ''))
        .join('\n');
}

describe('a guarda de takeover não pode voltar a ser código morto', () => {
    const AGENTE = semComentarios('lib/ai/agent/agent.service.ts');

    it('o bloco não exige assigned_user_id pra rodar', () => {
        // Era esta condição que impedia a guarda de existir na prática.
        expect(AGENTE).not.toMatch(/takeoverEnabled\s*&&\s*conversation\?\.assigned_user_id/);
        expect(AGENTE).toMatch(/if\s*\(\s*aiConfig\.takeoverEnabled\s*\)/);
    });

    it('a checagem de humano é chamada dentro do bloco', () => {
        expect(AGENTE).toMatch(/humanoJaAtendeuAConversa\(\s*supabase,\s*conversationId\s*\)/);
    });
});

describe('o webhook precisa marcar quem enviou', () => {
    const WEBHOOK = semComentarios('supabase/functions/messaging-webhook-evolution/index.ts');

    it('mensagem que sai do celular da equipe entra como user', () => {
        // Sem isto ela entra com sender_type nulo e nenhuma guarda consegue
        // distinguir equipe de ninguém.
        expect(WEBHOOK).toMatch(/isFromMe\s*\?\s*\{\s*sender_type:\s*"user"\s*\}\s*:\s*\{\s*\}/);
    });
});
