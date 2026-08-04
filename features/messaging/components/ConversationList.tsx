'use client';

import React, { useState, useMemo, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { ConversationItem } from './ConversationItem';
import { ChannelIndicator } from './ChannelIndicator';
import { useConversations } from '@/lib/query/hooks/useConversationsQuery';
import { useDraftConversationIds } from '@/lib/query/hooks/useMessagingMessagesQuery';
import type { ConversationFilters, ConversationStatus, ChannelType, ConversationView } from '@/lib/messaging/types';
import type { PresenceStatus } from '@/lib/messaging/hooks/useContactPresence';

interface ConversationItemWrapperProps {
  conversation: ConversationView;
  isSelected: boolean;
  onSelect: (id: string) => void;
  presenceStatus?: PresenceStatus;
  hasDraft?: boolean;
}

const ConversationItemWrapper = memo(function ConversationItemWrapper({
  conversation,
  isSelected,
  onSelect,
  presenceStatus,
  hasDraft,
}: ConversationItemWrapperProps) {
  const handleClick = useCallback(() => {
    onSelect(conversation.id);
  }, [onSelect, conversation.id]);

  return (
    <ConversationItem
      conversation={conversation}
      isSelected={isSelected}
      onClick={handleClick}
      presenceStatus={presenceStatus}
      hasDraft={hasDraft}
    />
  );
});

interface ConversationListProps {
  selectedId?: string;
  onSelect: (conversationId: string) => void;
  businessUnitId?: string;
  getPresence?: (contactId: string) => 'online' | 'typing' | 'recording' | 'offline';
}

const CHANNEL_OPTIONS: { id: ChannelType | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos os canais' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
];

export const ConversationList = memo(function ConversationList({
  selectedId,
  onSelect,
  businessUnitId,
  getPresence,
}: ConversationListProps) {
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<ChannelType | 'all'>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filters: ConversationFilters = useMemo(() => ({
    status: statusFilter,
    businessUnitId,
    search: searchQuery || undefined,
    channelType: channelFilter !== 'all' ? channelFilter : undefined,
    hasUnread: showUnreadOnly || undefined,
  }), [statusFilter, businessUnitId, searchQuery, channelFilter, showUnreadOnly]);

  const { data: conversations, isLoading, error } = useConversations(filters);
  const { data: draftConversationIds } = useDraftConversationIds();

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (channelFilter !== 'all') count++;
    if (showUnreadOnly) count++;
    return count;
  }, [channelFilter, showUnreadOnly]);

  const clearFilters = () => {
    setChannelFilter('all');
    setShowUnreadOnly(false);
  };

  const statusTabs = [
    { id: 'open' as const, label: 'abertas' },
    { id: 'resolved' as const, label: 'resolvidas' },
  ];

  return (
    <div className="conv-pane">
      <div className="conv-pane__head">
        <div className="chip-row">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn('chip', statusFilter === tab.id && 'chip--active')}
              onClick={() => setStatusFilter(tab.id)}
              aria-pressed={statusFilter === tab.id}
            >
              {tab.label}
            </button>
          ))}
          <span className="spacer" />
          <button
            type="button"
            className={cn('chip', (showFilters || activeFiltersCount > 0) && 'chip--ia')}
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-label="Filtros"
            title="Filtros"
          >
            filtros
            {activeFiltersCount > 0 && <span className="badge-count">{activeFiltersCount}</span>}
          </button>
        </div>

        <div className="field">
          <label className="sr-only" htmlFor="conv-search">Buscar conversas</label>
          <input
            id="conv-search"
            type="search"
            className="input"
            placeholder="buscar conversas…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {showFilters && (
          <div className="field">
            <span className="field__label">canal</span>
            <div className="chip-row">
              {CHANNEL_OPTIONS.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setChannelFilter(channel.id)}
                  className={cn('chip', channelFilter === channel.id && 'chip--active')}
                  title={channel.label}
                >
                  {channel.id !== 'all' && (
                    <ChannelIndicator type={channel.id as ChannelType} size="sm" />
                  )}
                  {channel.id === 'all' ? channel.label : ''}
                </button>
              ))}
            </div>

            <div className="setting-row" style={{ paddingBlock: 8 }}>
              <span className="setting-row__text">
                <span className="setting-row__title">apenas não lidas</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showUnreadOnly}
                aria-label="Apenas não lidas"
                onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                className={cn('toggle', showUnreadOnly && 'toggle--on')}
              />
            </div>

            {activeFiltersCount > 0 && (
              <button type="button" onClick={clearFilters} className="btn btn--quiet btn--block">
                limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      <ul className="conv-list">
        {isLoading ? (
          <li className="skeleton-stack" style={{ padding: 'var(--space-2)' }}>
            {[...Array(5)].map((_, i) => (
              <span key={i} className="skeleton skeleton--card" style={{ display: 'block' }} />
            ))}
          </li>
        ) : error ? (
          <li className="banner banner--error">
            <span className="dot" />
            <span className="banner__text">Erro ao carregar conversas</span>
          </li>
        ) : conversations?.length === 0 ? (
          <li className="state-empty">
            <h3 className="state-empty__title">
              nenhuma conversa<span className="dot-accent">.</span>
            </h3>
            <p className="state-empty__text">
              {statusFilter === 'open'
                ? 'nada aberto por aqui — tudo respondido.'
                : 'nenhuma conversa resolvida ainda.'}
            </p>
          </li>
        ) : (
          conversations?.map((conversation) => (
            <li key={conversation.id}>
              <ConversationItemWrapper
                conversation={conversation}
                isSelected={conversation.id === selectedId}
                onSelect={onSelect}
                presenceStatus={conversation.contactId && getPresence ? getPresence(conversation.contactId) : undefined}
                hasDraft={draftConversationIds?.has(conversation.id) ?? false}
              />
            </li>
          ))
        )}
      </ul>
    </div>
  );
});
