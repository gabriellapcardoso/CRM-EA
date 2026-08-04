'use client';

import React, { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { ChannelIndicator } from './ChannelIndicator';
import { PresenceIndicator } from './PresenceIndicator';
import type { ConversationView } from '@/lib/messaging/types';
import type { PresenceStatus } from '@/lib/messaging/hooks/useContactPresence';

interface ConversationItemProps {
  conversation: ConversationView;
  isSelected: boolean;
  onClick: () => void;
  presenceStatus?: PresenceStatus;
  hasDraft?: boolean;
}

/** Iniciais para o `.avatar` quando não há foto do contato. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  onClick,
  presenceStatus = 'offline',
  hasDraft = false,
}: ConversationItemProps) {
  const {
    externalContactName,
    externalContactAvatar,
    contactName,
    channelType,
    channelName,
    lastMessagePreview,
    lastMessageAt,
    lastMessageDirection,
    unreadCount,
    isWindowExpired,
    windowMinutesRemaining,
    assignedUserName,
    status,
  } = conversation;

  const displayName = contactName || externalContactName || 'Contato desconhecido';
  const timeAgo = lastMessageAt
    ? formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true, locale: ptBR })
    : '';
  const avatarUrl = sanitizeUrl(externalContactAvatar);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'card-conv w-full text-left',
        isSelected && 'card-conv--active',
        unreadCount > 0 && 'card-conv--unread'
      )}
      style={status === 'resolved' ? { opacity: 0.6 } : undefined}
      aria-current={isSelected ? 'true' : undefined}
    >
      {/* Avatar + canal */}
      <span className="card-conv__avatar">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="avatar avatar--md"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <span className="avatar avatar--md avatar--purple">{initials(displayName)}</span>
        )}
        <ChannelIndicator type={channelType} size="sm" />
        {presenceStatus !== 'offline' && (
          <span style={{ position: 'absolute', top: -3, right: -3 }}>
            <PresenceIndicator status={presenceStatus} size="sm" />
          </span>
        )}
      </span>

      {/* Corpo */}
      <span className="card-conv__body">
        <span className="card-conv__top">
          <span className="card-conv__name">{displayName}</span>
          <span className="card-conv__time">{timeAgo}</span>
        </span>
        <span className="card-conv__org">{channelName}</span>
        <span className="card-conv__preview">
          {lastMessageDirection === 'outbound' ? 'Você: ' : ''}
          {lastMessagePreview || 'Sem mensagens'}
        </span>

        {(hasDraft || isWindowExpired || assignedUserName
          || (windowMinutesRemaining !== undefined && windowMinutesRemaining <= 60)) && (
          <span className="chip-row" style={{ marginTop: 6 }}>
            {hasDraft && <span className="tag-pending">rascunho</span>}
            {!isWindowExpired && windowMinutesRemaining !== undefined && windowMinutesRemaining <= 60 && (
              <span className="status-chip status-chip--warn">{windowMinutesRemaining}min</span>
            )}
            {isWindowExpired && <span className="status-chip status-chip--off">janela expirada</span>}
            {assignedUserName && (
              <span className="status-chip status-chip--muted nowrap">{assignedUserName}</span>
            )}
          </span>
        )}
      </span>

      {unreadCount > 0 && (
        <span className="card-conv__unread">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </button>
  );
});
