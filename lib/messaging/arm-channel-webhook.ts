/**
 * @fileoverview Arma o webhook de um canal no servidor do provider.
 *
 * Separado de `webhook-url.ts` de propósito: aquele é puro e as telas de
 * settings podem importar; este puxa a factory de providers e só roda no
 * servidor.
 *
 * Motivo de existir: até 2026-09-03 `configureWebhook()` estava implementado
 * nos providers Evolution e Z-API, correto, com header de auth e tudo — e
 * nenhum caminho do app chamava. Configurar webhook era copiar e colar a URL
 * no painel do provider, à mão. Foi assim que o canal da aaagência passou a
 * existir "conectado" com webhook desabilitado por 5 semanas. Código certo que
 * ninguém chama é código que não existe.
 *
 * @module lib/messaging/arm-channel-webhook
 */

import { redactSecrets } from '@/lib/security/redactSecrets';
import { ChannelProviderFactory } from './channel-factory';
import { buildChannelWebhookUrl } from './webhook-url';
import type { ChannelType } from './types';

export interface CanalParaArmar {
  id: string;
  channel_type: string;
  provider: string;
  external_identifier: string | null;
  credentials: Record<string, string> | null;
}

export interface ConfigWebhookDoProvider {
  enabled: boolean;
  url: string | null;
  events: string[];
  byEvents: boolean;
  hasAuthHeader: boolean;
}

export interface ResultadoLerWebhook {
  /** `false` quando o provider não expõe leitura de webhook por API. */
  suportado: boolean;
  /** URL que este canal deveria ter gravado no provider. */
  urlEsperada: string | null;
  /** `true` só quando os quatro campos que importam estão certos. */
  saudavel: boolean;
  config?: ConfigWebhookDoProvider;
  motivo?: string;
}

export interface ResultadoArmarWebhook {
  /** `true` só quando o provider confirmou que gravou. */
  armado: boolean;
  /** URL que foi enviada ao provider, ou `null` se nem deu pra montar. */
  url: string | null;
  /** Motivo de não ter armado, pronto pra log. Ausente em caso de sucesso. */
  motivo?: string;
}

/**
 * Configura o webhook do canal apontando pra Edge Function correspondente.
 *
 * Best-effort por contrato: quem chama decide se falhar aqui derruba a
 * operação toda. No fluxo de conectar, não derruba — um canal que conectou de
 * verdade não deve virar erro porque o webhook não gravou; mas o resultado
 * sobe na resposta pra chamada não poder alegar sucesso silencioso, que é
 * exatamente o modo de falha que este módulo existe pra fechar.
 */
export async function armarWebhookDoCanal(
  canal: CanalParaArmar,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): Promise<ResultadoArmarWebhook> {
  const url = buildChannelWebhookUrl(canal.provider, canal.id, supabaseUrl);

  if (!url) {
    return {
      armado: false,
      url: null,
      motivo: 'NEXT_PUBLIC_SUPABASE_URL ausente ou inválida — sem URL pública pra apontar o webhook',
    };
  }

  try {
    const provider = ChannelProviderFactory.createProvider(
      canal.channel_type as ChannelType,
      canal.provider,
    );

    await provider.initialize({
      channelId: canal.id,
      channelType: canal.channel_type as ChannelType,
      provider: canal.provider,
      externalIdentifier: canal.external_identifier ?? '',
      credentials: canal.credentials ?? {},
    });

    if (!('configureWebhook' in provider)) {
      return {
        armado: false,
        url,
        motivo: `Provider ${canal.provider} não configura webhook por API (registro manual no painel do provider)`,
      };
    }

    const resultado = await (
      provider as { configureWebhook: (u: string) => Promise<{ success: boolean; error?: string }> }
    ).configureWebhook(url);

    if (!resultado.success) {
      return {
        armado: false,
        url,
        motivo: redactSecrets(resultado.error ?? 'Provider recusou a configuração do webhook'),
      };
    }

    return { armado: true, url };
  } catch (error) {
    return {
      armado: false,
      url,
      motivo: redactSecrets(error instanceof Error ? error.message : 'Erro desconhecido ao configurar webhook'),
    };
  }
}

/**
 * Lê o webhook que está gravado no servidor do provider e diz se ele entrega.
 *
 * "Saudável" exige os quatro campos, não só a URL. O canal da aaagência tinha
 * a URL exatamente certa e mesmo assim não entregava nada, porque `enabled`
 * era `false`, `events` era `[]` e `headers` era `null` — e a Edge Function é
 * default-deny, então sem o header ela responde 401 e a Evolution engole. Uma
 * checagem que só compara URL teria dado verde nos 5 dias e nas 5 semanas.
 */
export async function lerWebhookDoCanal(
  canal: CanalParaArmar,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): Promise<ResultadoLerWebhook> {
  const urlEsperada = buildChannelWebhookUrl(canal.provider, canal.id, supabaseUrl);

  try {
    const provider = ChannelProviderFactory.createProvider(
      canal.channel_type as ChannelType,
      canal.provider,
    );

    await provider.initialize({
      channelId: canal.id,
      channelType: canal.channel_type as ChannelType,
      provider: canal.provider,
      externalIdentifier: canal.external_identifier ?? '',
      credentials: canal.credentials ?? {},
    });

    if (!('getWebhookConfig' in provider)) {
      return { suportado: false, urlEsperada, saudavel: false };
    }

    const config = await (
      provider as { getWebhookConfig: () => Promise<ConfigWebhookDoProvider> }
    ).getWebhookConfig();

    const saudavel =
      config.enabled &&
      config.url === urlEsperada &&
      config.events.length > 0 &&
      config.hasAuthHeader;

    return { suportado: true, urlEsperada, saudavel, config };
  } catch (error) {
    return {
      suportado: true,
      urlEsperada,
      saudavel: false,
      motivo: redactSecrets(error instanceof Error ? error.message : 'Erro desconhecido ao ler webhook'),
    };
  }
}
