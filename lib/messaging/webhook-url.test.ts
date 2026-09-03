/**
 * Guardas da montagem da URL de webhook.
 *
 * O ponto sensível não é acertar a URL feliz — é NUNCA devolver uma string
 * quebrada. Armar `undefined/functions/v1/...` no servidor do provider deixa o
 * painel mostrando um webhook "configurado" que não entrega nada, que é
 * exatamente o estado silencioso que este módulo existe pra impedir.
 */
import { describe, expect, it } from 'vitest';
import { buildChannelWebhookUrl, webhookFunctionForProvider } from './webhook-url';

const CANAL = 'cad3274f-2aba-4986-959a-a50ba0f9cb51';
const SUPABASE = 'https://zuuqcwxletrfmpcqagxc.supabase.co';

describe('buildChannelWebhookUrl', () => {
  it('monta a URL da Edge Function do provider', () => {
    expect(buildChannelWebhookUrl('evolution', CANAL, SUPABASE)).toBe(
      `${SUPABASE}/functions/v1/messaging-webhook-evolution/${CANAL}`,
    );
  });

  it('devolve null sem NEXT_PUBLIC_SUPABASE_URL, nunca uma URL com undefined', () => {
    expect(buildChannelWebhookUrl('evolution', CANAL, undefined)).toBeNull();
    expect(buildChannelWebhookUrl('evolution', CANAL, '')).toBeNull();
  });

  it('devolve null quando a URL do Supabase é inválida', () => {
    expect(buildChannelWebhookUrl('evolution', CANAL, 'nao-e-url')).toBeNull();
  });

  it('devolve null sem channelId — webhook sem canal não tem pra onde entregar', () => {
    expect(buildChannelWebhookUrl('evolution', '', SUPABASE)).toBeNull();
  });

  it('ignora path e query que venham na env, usando só a origem', () => {
    expect(buildChannelWebhookUrl('evolution', CANAL, `${SUPABASE}/rest/v1?x=1`)).toBe(
      `${SUPABASE}/functions/v1/messaging-webhook-evolution/${CANAL}`,
    );
  });
});

describe('webhookFunctionForProvider', () => {
  it.each([
    ['evolution', 'messaging-webhook-evolution'],
    ['z-api', 'messaging-webhook-zapi'],
    ['meta-cloud', 'messaging-webhook-meta'],
    ['meta', 'messaging-webhook-meta'],
    ['resend', 'messaging-webhook-resend'],
  ])('%s → %s', (provider, esperado) => {
    expect(webhookFunctionForProvider(provider)).toBe(esperado);
  });

  it('provider desconhecido cai no mesmo fallback que as telas de settings já usavam', () => {
    expect(webhookFunctionForProvider('inventado')).toBe('messaging-webhook-zapi');
  });
});
