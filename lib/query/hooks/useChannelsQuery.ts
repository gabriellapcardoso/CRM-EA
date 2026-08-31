'use client';

/**
 * @fileoverview Query hooks for messaging channels
 *
 * Provides TanStack Query hooks for managing messaging channels
 * (WhatsApp, Instagram, Email, etc.)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { queryKeys, entityCachesExceptDetail } from '../queryKeys';
import {
  type MessagingChannel,
  type DbMessagingChannel,
  type CreateChannelInput,
  type UpdateChannelInput,
  transformChannel,
  transformChannelToDb,
} from '@/lib/messaging/types';

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch all channels for the current organization.
 */
export function useChannelsQuery() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.all,
    queryFn: async (): Promise<MessagingChannel[]> => {
      if (!profile?.organization_id) {
        return [];
      }

      // Exclude credentials from list query to avoid leaking secrets to React state
      // Join with business_units to get the unit name
      const { data, error } = await supabase
        .from('messaging_channels')
        .select(`
          id,organization_id,business_unit_id,channel_type,provider,external_identifier,name,settings,status,status_message,last_connected_at,created_at,updated_at,deleted_at,
          business_unit:business_units!business_unit_id(name)
        `)
        .eq('organization_id', profile.organization_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row) => {
        // business_unit is a single object from the FK join, but Supabase types it as array
        const businessUnit = (Array.isArray(row.business_unit)
          ? row.business_unit[0]
          : row.business_unit) as { name: string } | null;
        return transformChannel({
          ...row,
          credentials: {},
          business_unit_name: businessUnit?.name,
        } as DbMessagingChannel & { business_unit_name?: string });
      });
    },
    enabled: !!profile?.organization_id,
  });
}

/**
 * Fetch a single channel by ID.
 */
export function useChannelQuery(channelId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.messagingChannels.detail(channelId!),
    queryFn: async (): Promise<MessagingChannel | null> => {
      if (!channelId) return null;

      const { data, error } = await supabase
        .from('messaging_channels')
        .select('*')
        .eq('id', channelId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;

      return data ? transformChannel(data as DbMessagingChannel) : null;
    },
    enabled: !!channelId,
  });
}

/**
 * Fetch connected channels only.
 */
export function useConnectedChannelsQuery() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.connected(),
    queryFn: async (): Promise<MessagingChannel[]> => {
      if (!profile?.organization_id) {
        return [];
      }

      // Exclude credentials from list query
      const { data, error } = await supabase
        .from('messaging_channels')
        .select('id,organization_id,business_unit_id,channel_type,provider,external_identifier,name,settings,status,status_message,last_connected_at,created_at,updated_at,deleted_at')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'connected')
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;

      return (data as DbMessagingChannel[]).map((row) =>
        transformChannel({ ...row, credentials: {} } as DbMessagingChannel)
      );
    },
    enabled: !!profile?.organization_id,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create a new messaging channel.
 */
export function useCreateChannelMutation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateChannelInput): Promise<MessagingChannel> => {
      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      const dbData = transformChannelToDb(input, profile.organization_id);

      const { data, error } = await supabase
        .from('messaging_channels')
        .insert({
          ...dbData,
          status: 'pending',
        })
        .select('*')
        .single();

      if (error) throw error;

      return transformChannel(data as DbMessagingChannel);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('messagingChannels') });
    },
  });
}

/**
 * Update an existing channel.
 */
export function useUpdateChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      input,
    }: {
      channelId: string;
      input: UpdateChannelInput;
    }): Promise<MessagingChannel> => {
      const dbData = transformChannelToDb(input);

      const { data, error } = await supabase
        .from('messaging_channels')
        .update({
          ...dbData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', channelId)
        .select('*')
        .single();

      if (error) throw error;

      return transformChannel(data as DbMessagingChannel);
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('messagingChannels') });
      if (data) {
        queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.detail(data.id) });
      }
    },
  });
}

/**
 * Delete (soft-delete) a channel.
 */
export function useDeleteChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string): Promise<void> => {
      const { error } = await supabase
        .from('messaging_channels')
        .update({
          deleted_at: new Date().toISOString(),
          status: 'disconnected',
        })
        .eq('id', channelId);

      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('messagingChannels') });
    },
  });
}

/**
 * Toggle channel active status.
 */
export function useToggleChannelStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      connect,
    }: {
      channelId: string;
      connect: boolean;
    }): Promise<MessagingChannel> => {
      const { data, error } = await supabase
        .from('messaging_channels')
        .update({
          status: connect ? 'connecting' : 'disconnected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', channelId)
        .select('*')
        .single();

      if (error) throw error;

      return transformChannel(data as DbMessagingChannel);
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('messagingChannels') });
      if (data) {
        queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.detail(data.id) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.connected() });
    },
  });
}

/**
 * Result of POST /api/messaging/channels/[id]/disconnect.
 * `providerDisconnected: false` significa que o canal foi marcado como
 * desconectado no CRM, mas a sessão no provider pode continuar ativa.
 * `persisted: false` significa que o UPDATE no banco falhou — o status
 * pode não refletir a desconexão real mesmo com providerDisconnected=true.
 */
export interface DisconnectChannelResult {
  success: true;
  providerDisconnected: boolean;
  persisted: boolean;
  warning?: string;
}

/**
 * Disconnect a channel for real: encerra a sessão no provider (Evolution
 * logout / Z-API disconnect) e marca o canal como desconectado.
 *
 * Diferente de useToggleChannelStatusMutation, que só escreve o status no
 * banco e deixa a sessão viva do lado do provider.
 */
export function useDisconnectChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: async (channelId: string): Promise<DisconnectChannelResult> => {
      const res = await fetch(`/api/messaging/channels/${channelId}/disconnect`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to disconnect channel' }));
        throw new Error(body.error ?? 'Failed to disconnect channel');
      }

      return res.json();
    },
    onSettled: (_data, _error, channelId) => {
      queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('messagingChannels') });
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.detail(channelId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.connected() });
    },
  });
}

/**
 * Request a QR code to (re)connect a WhatsApp channel (z-api or evolution).
 * Calls the real provider via the API route — unlike useToggleChannelStatusMutation,
 * this actually talks to the messaging provider.
 */
export function useConnectChannelMutation() {
  return useMutation({
    // Retry explícito 0: o caller (QrConnectModal) já oferece "tentar novamente"
    // manual; um retry automático silencioso só atrasa a mensagem de erro chegando
    // na tela sem ganhar nada (erro de provider não se resolve sozinho em 1s).
    retry: 0,
    mutationFn: async (channelId: string): Promise<{ qrCode: string; expiresAt: string }> => {
      const res = await fetch(`/api/messaging/channels/${channelId}/qr-code`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to get QR code' }));
        throw new Error(body.error ?? 'Failed to get QR code');
      }

      return res.json();
    },
  });
}

/**
 * Lightweight status-only poll target for QrConnectModal.
 * Deliberately does NOT reuse useChannelQuery — that hook selects '*',
 * including `credentials`, which would leak API keys to the browser on
 * every poll tick.
 */
export function useChannelConnectionStatus(channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.messagingChannels.connectionStatus(channelId),
    queryFn: async (): Promise<{ id: string; status: string; updated_at: string }> => {
      const { data, error } = await supabase
        .from('messaging_channels')
        .select('id, status, updated_at')
        .eq('id', channelId)
        .single();

      if (error) throw error;

      return data;
    },
    enabled,
    refetchInterval: enabled ? 3000 : false,
  });
}
