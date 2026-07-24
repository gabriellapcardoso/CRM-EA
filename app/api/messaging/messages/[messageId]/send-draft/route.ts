/**
 * POST /api/messaging/messages/[messageId]/send-draft
 *
 * Envia de fato um rascunho criado pelo T2 (status='draft') e move o deal
 * vinculado pra "Contatado" (decisão 9 do PLANO-NOVO-FLUXO.md: 1ª msg sai
 * pelo inbox = Contatado, automático). Pré-requisito do T4 (TODOS.md) —
 * sem esta rota os rascunhos do T2 ficam presos, invisíveis pra operadora.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getChannelRouter, transformMessage } from '@/lib/messaging';
import type { MessageContent, DbMessagingMessage } from '@/lib/messaging';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: message, error: msgError } = await supabase
      .from('messaging_messages')
      .select(
        `
        *,
        conversation:messaging_conversations!conversation_id (
          id,
          contact_id,
          external_contact_id,
          channel_id,
          message_count,
          channel:messaging_channels!channel_id (
            id,
            channel_type,
            provider,
            organization_id
          )
        )
      `
      )
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }

    if (message.status !== 'draft') {
      return NextResponse.json(
        { message: 'Only draft messages can be sent via this endpoint' },
        { status: 400 }
      );
    }

    const conversation = message.conversation as {
      id: string;
      contact_id: string | null;
      external_contact_id: string;
      channel_id: string;
      message_count: number;
      channel: {
        id: string;
        channel_type: string;
        provider: string;
        organization_id: string;
      };
    };

    if (!conversation?.channel) {
      return NextResponse.json(
        { message: 'Message conversation or channel not found' },
        { status: 404 }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile || profile.organization_id !== conversation.channel.organization_id) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Reset atômico draft -> queued (só se ainda for draft — evita corrida de duplo clique)
    const { data: claimed } = await supabase
      .from('messaging_messages')
      .update({ status: 'queued' })
      .eq('id', messageId)
      .eq('status', 'draft')
      .select('id')
      .single();

    if (!claimed) {
      return NextResponse.json(
        { message: 'Draft is no longer pending (possibly already sent)' },
        { status: 409 }
      );
    }

    const router = getChannelRouter();
    const content = message.content as unknown as MessageContent;

    const result = await router.sendMessage(conversation.channel_id, {
      conversationId: conversation.id,
      to: conversation.external_contact_id,
      content,
    });

    if (result.success) {
      await supabase
        .from('messaging_messages')
        .update({
          status: 'sent',
          external_id: result.externalMessageId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      // A trigger de preview/contador só dispara em INSERT — e o rascunho original
      // foi inserido com status='draft', que ela ignora de propósito (T2). Sem isto,
      // a conversa nunca seria "contabilizada": preview/contador ficariam errados
      // pra sempre depois do envio, mesmo com a mensagem já enviada de fato.
      const preview =
        message.content_type === 'text'
          ? String((message.content as { text?: string })?.text ?? '').slice(0, 100)
          : `[${message.content_type}]`;

      await supabase
        .from('messaging_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
          last_message_direction: 'outbound',
          message_count: (conversation.message_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);

      // Decisão 9 (PLANO-NOVO-FLUXO.md): 1ª msg sai pelo inbox -> deal move pra "Contatado"
      if (conversation.contact_id) {
        const { data: deal } = await supabase
          .from('deals')
          .select('id, board_id, stage_id')
          .eq('contact_id', conversation.contact_id)
          .eq('is_won', false)
          .eq('is_lost', false)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (deal) {
          const { data: contatadoStage } = await supabase
            .from('board_stages')
            .select('id')
            .eq('board_id', deal.board_id)
            .eq('name', 'contatado')
            .maybeSingle();

          if (contatadoStage && contatadoStage.id !== deal.stage_id) {
            await supabase.rpc('move_deal_to_stage', {
              p_deal_id: deal.id,
              p_stage_id: contatadoStage.id,
            });
          }
        }
      }
    } else {
      await supabase
        .from('messaging_messages')
        .update({
          status: 'failed',
          error_code: result.error?.code,
          error_message: result.error?.message,
          failed_at: new Date().toISOString(),
        })
        .eq('id', messageId);
    }

    const { data: updatedMessage } = await supabase
      .from('messaging_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (!updatedMessage) {
      return NextResponse.json({ message: 'Failed to fetch updated message' }, { status: 500 });
    }

    return NextResponse.json(transformMessage(updatedMessage as DbMessagingMessage));
  } catch (error) {
    console.error(
      '[messaging/messages/send-draft]',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
