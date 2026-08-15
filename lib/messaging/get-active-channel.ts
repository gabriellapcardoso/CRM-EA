import { createStaticAdminClient } from '@/lib/supabase/server';
import type { ChannelType } from './types';

/**
 * Resolve o canal ativo (mais recentemente conectado) de um tipo, pra uma
 * org — não existe hoje em lugar nenhum do lib/messaging/ (achado do
 * /plan-eng-review 2026-08-15): todo call site já tem um channelId em mãos.
 * Usado pelo disparo automático/manual de WhatsApp de proposta (T4), que só
 * tem organization_id.
 *
 * Múltiplos canais conectados do mesmo tipo (ex: migração de instância):
 * pega o mais recentemente conectado — decisão de arquitetura, não exige
 * UI nova pra resolver ambiguidade.
 */
export async function getActiveChannelForOrg(
  organizationId: string,
  channelType: ChannelType,
): Promise<{ id: string } | null> {
  const supabase = createStaticAdminClient();

  const { data, error } = await supabase
    .from('messaging_channels')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('channel_type', channelType)
    .eq('status', 'connected')
    .is('deleted_at', null)
    .order('last_connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[getActiveChannelForOrg] erro ao buscar canal:', error.message);
    return null;
  }

  return data ? { id: data.id as string } : null;
}
