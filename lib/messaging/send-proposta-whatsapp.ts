import { createStaticAdminClient } from '@/lib/supabase/server';
import { normalizePhoneE164 } from '@/lib/phone';
import { getChannelRouter } from '@/lib/messaging';
import { getActiveChannelForOrg } from './get-active-channel';

export type ResultadoEnvioWhatsapp =
  | { ok: true }
  | { ok: false; motivo: 'sem_canal' | 'falha_envio' | 'link_invalido' | 'ja_enviado'; erro?: string };

function linkValido(link: string): boolean {
  try {
    const u = new URL(link);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Envia o link da proposta por WhatsApp — chamada tanto pelo disparo
 * automático (/api/internal/auto-whatsapp-proposta, secret interno) quanto
 * pelo botão manual (/api/deals/[id]/send-whatsapp-proposal, sessão do
 * usuário). Mesma lógica core nos dois casos: resolve o canal ativo da org,
 * acha/cria a conversa, chama ChannelRouterService.sendMessage — que já
 * herda checkWhatsAppSendGuard() (kill switch + supressão LGPD).
 */
export async function enviarPropostaWhatsapp(params: {
  organizationId: string;
  phone: string;
  link: string;
  contactId?: string | null;
  contactName?: string | null;
}): Promise<ResultadoEnvioWhatsapp> {
  const { organizationId, phone, link, contactId, contactName } = params;

  // Achado do /review (2026-08-15): link_publico atravessa fronteira de
  // sistema (webhook-in recebe de um projeto Supabase diferente) — validar
  // formato antes de mandar texto arbitrário pelo WhatsApp comercial real.
  if (!linkValido(link)) {
    return { ok: false, motivo: 'link_invalido' };
  }

  const supabase = createStaticAdminClient();

  const canal = await getActiveChannelForOrg(organizationId, 'whatsapp');
  if (!canal) {
    return { ok: false, motivo: 'sem_canal' };
  }

  const { data: channelRow, error: channelErr } = await supabase
    .from('messaging_channels')
    .select('id, business_unit_id')
    .eq('id', canal.id)
    .single();

  if (channelErr || !channelRow) {
    return { ok: false, motivo: 'sem_canal' };
  }

  const externalContactId = normalizePhoneE164(phone) ?? phone;

  const { data: existingConv } = await supabase
    .from('messaging_conversations')
    .select('id')
    .eq('channel_id', channelRow.id)
    .eq('external_contact_id', externalContactId)
    .maybeSingle();

  let conversationId = existingConv?.id as string | undefined;

  if (!conversationId) {
    const { data: createdConv, error: createConvErr } = await supabase
      .from('messaging_conversations')
      .insert({
        organization_id: organizationId,
        channel_id: channelRow.id,
        business_unit_id: channelRow.business_unit_id,
        external_contact_id: externalContactId,
        external_contact_name: contactName || externalContactId,
        contact_id: contactId || null,
        status: 'open',
        priority: 'normal',
      })
      .select('id')
      .single();

    if (createConvErr || !createdConv) {
      // Corrida: outra chamada concorrente (ex. automático + manual quase
      // simultâneos) já criou a conversa entre o SELECT e este INSERT —
      // messaging_conversations_unique (channel_id, external_contact_id)
      // rejeita o segundo insert. Busca a que já existe em vez de falhar o
      // envio por causa de uma corrida benigna.
      if (createConvErr?.code === '23505') {
        const { data: retryConv } = await supabase
          .from('messaging_conversations')
          .select('id')
          .eq('channel_id', channelRow.id)
          .eq('external_contact_id', externalContactId)
          .maybeSingle();
        if (retryConv?.id) {
          conversationId = retryConv.id as string;
        } else {
          return { ok: false, motivo: 'falha_envio', erro: createConvErr.message };
        }
      } else {
        return { ok: false, motivo: 'falha_envio', erro: createConvErr?.message };
      }
    } else {
      conversationId = createdConv.id as string;
    }
  }

  // Achado do /review (2026-08-15): sem isso, disparo automático + botão
  // manual (ou replay de rede) mandavam o MESMO link duas vezes pro mesmo
  // contato. Dedupe por (conversa, link, já enviado) — não por tempo, por
  // "esse link específico já saiu pra esse contato".
  const { data: jaEnviado } = await supabase
    .from('messaging_messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'sent')
    .contains('metadata', { source: 'proposta-pronta-t4', link })
    .limit(1)
    .maybeSingle();

  if (jaEnviado) {
    return { ok: false, motivo: 'ja_enviado' };
  }

  const { error: insertMsgErr, data: dbMessage } = await supabase
    .from('messaging_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'outbound',
      content_type: 'text',
      content: { type: 'text', text: `Segue o link da proposta: ${link}` },
      status: 'pending',
      sender_type: 'system',
      metadata: { source: 'proposta-pronta-t4', link },
    })
    .select('id')
    .single();

  if (insertMsgErr || !dbMessage) {
    return { ok: false, motivo: 'falha_envio', erro: insertMsgErr?.message };
  }

  const router = getChannelRouter();
  const result = await router.sendMessage(channelRow.id, {
    conversationId,
    to: externalContactId,
    content: { type: 'text', text: `Segue o link da proposta: ${link}` },
  });

  await supabase
    .from('messaging_messages')
    .update({
      status: result.success ? 'sent' : 'failed',
      external_id: result.externalMessageId ?? null,
      error_message: result.success ? null : result.error?.message,
    })
    .eq('id', dbMessage.id);

  if (!result.success) {
    return { ok: false, motivo: 'falha_envio', erro: result.error?.message };
  }

  return { ok: true };
}
