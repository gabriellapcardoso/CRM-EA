'use client';

import React, { memo, useState } from 'react';
import {
  User,
  Phone,
  Mail,
  Building,
  Tag,
  Calendar,
  Clock,
  ExternalLink,
  Briefcase,
  ChevronDown,
  ChevronUp,
  LinkIcon,
  MessageSquare,
  GitMerge,
  BotOff,
  Bot,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import type { ConversationView } from '@/lib/messaging/types';
import { ChannelIndicator } from './ChannelIndicator';
import { WindowExpiryBadge } from './WindowExpiryBadge';
import { ContactPanelSkeleton } from './skeletons/ContactPanelSkeleton';
import { useUpdateContact } from '@/lib/query/hooks/useContactsQuery';
import { useToggleConversationAiPause } from '@/lib/query/hooks/useMessagingConversationsQuery';

interface ContactPanelProps {
  conversation: ConversationView | null | undefined;
  isLoading?: boolean;
  onLinkContact?: () => void;
  onViewContact?: (contactId: string) => void;
  onViewDeals?: (contactId: string) => void;
  hasDuplicate?: boolean;
  onResolveDuplicate?: () => void;
  className?: string;
}

interface InfoRowProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  className?: string;
}

const InfoRow = memo(function InfoRow({ icon: Icon, label, value, className }: InfoRowProps) {
  return (
    <div className={cn('data-list__row', className)}>
      <dt className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        {label}
      </dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
});

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const Section = memo(function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="detail-pane__section">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={isOpen}
      >
        <span className="label">{title}</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        )}
      </button>
      {isOpen && children}
    </section>
  );
});

export const ContactPanel = memo(function ContactPanel({
  conversation,
  isLoading,
  onLinkContact,
  onViewContact,
  onViewDeals,
  hasDuplicate,
  onResolveDuplicate,
  className,
}: ContactPanelProps) {
  // Hooks must be called unconditionally before any early returns
  const updateContact = useUpdateContact();
  const toggleConversationAiPause = useToggleConversationAiPause();

  const contactId = conversation?.contactId;
  const isAiPaused = contactId
    ? (conversation?.contactAiPaused ?? false)
    : (conversation?.metadata?.ai_paused === true);
  const isPending = updateContact.isPending || toggleConversationAiPause.isPending;

  function handleToggleAiPause() {
    if (!conversation) return;
    if (contactId) {
      updateContact.mutate({ id: contactId, updates: { aiPaused: !isAiPaused } });
    } else {
      toggleConversationAiPause.mutate({
        conversationId: conversation.id,
        paused: !isAiPaused,
        currentMetadata: conversation.metadata as Record<string, unknown>,
      });
    }
  }

  if (isLoading) {
    return <ContactPanelSkeleton className={className} />;
  }

  if (!conversation) {
    return (
      <aside className={cn('context-pane', className)} aria-label="Contexto da conversa">
        <div className="state-empty">
          <p className="state-empty__text">selecione uma conversa para ver os detalhes.</p>
        </div>
      </aside>
    );
  }

  const {
    externalContactName,
    externalContactAvatar,
    contactName,
    contactEmail,
    contactPhone,
    channelType,
    channelName,
    windowExpiresAt,
    assignedUserName,
    createdAt,
    lastMessageAt,
    messageCount,
    status,
    priority,
  } = conversation;

  const displayName = contactName || externalContactName || 'Contato desconhecido';
  const hasLinkedContact = !!contactId;

  return (
    <aside className={cn('context-pane', className)} aria-label="Contexto da conversa">
      {/* Cabeçalho do contato */}
      <div className="detail-pane__head">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            {sanitizeUrl(externalContactAvatar) ? (
              <img
                src={sanitizeUrl(externalContactAvatar)}
                alt={displayName}
                className="avatar avatar--lg"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <span className="avatar avatar--lg avatar--purple">
                <User className="w-5 h-5" aria-hidden="true" />
              </span>
            )}
            <span style={{ position: 'absolute', right: -3, bottom: -3 }}>
              <ChannelIndicator type={channelType} size="sm" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="detail-pane__name">{displayName}</h3>
            <p className="detail-pane__sub">{channelName}</p>
          </div>
        </div>

        <div className="chip-row" style={{ marginTop: 'var(--space-2)' }}>
          <span className={cn('status-chip', status === 'open' ? 'status-chip--on' : 'status-chip--muted')}>
            {status === 'open' ? 'aberta' : 'resolvida'}
          </span>
          {priority && priority !== 'normal' && (
            <span className={cn('status-chip', priority === 'urgent' ? 'status-chip--off' : 'status-chip--warn')}>
              {priority === 'high' ? 'alta' : priority === 'urgent' ? 'urgente' : priority}
            </span>
          )}
          <WindowExpiryBadge windowExpiresAt={windowExpiresAt} variant="inline" />
          {hasDuplicate && (
            <button type="button" onClick={onResolveDuplicate} className="chip chip--hitl">
              <GitMerge className="w-3 h-3" aria-hidden="true" />
              duplicado
            </button>
          )}
        </div>

        {/* Ações rápidas */}
        <div className="flex items-center gap-2" style={{ marginTop: 'var(--space-3)' }}>
          {hasLinkedContact && onViewContact && (
            <button type="button" onClick={() => onViewContact(contactId!)} className="btn btn--primary" style={{ flex: 1 }}>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              ver contato
            </button>
          )}
          {!hasLinkedContact && onLinkContact && (
            <button type="button" onClick={onLinkContact} className="btn btn--ghost" style={{ flex: 1 }}>
              <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
              vincular contato
            </button>
          )}
          {hasLinkedContact && onViewDeals && (
            <button type="button" onClick={() => onViewDeals(contactId!)} className="btn btn--ghost" style={{ flex: 1 }}>
              <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
              negócios
            </button>
          )}
        </div>
      </div>

      {/* Informações do contato */}
      <Section title="informações">
        <dl className="data-list">
          {contactPhone && <InfoRow icon={Phone} label="telefone" value={contactPhone} />}
          {contactEmail && <InfoRow icon={Mail} label="e-mail" value={contactEmail} />}
          {assignedUserName && <InfoRow icon={User} label="atribuído para" value={assignedUserName} />}
        </dl>

        <div className="setting-row">
          <span className="setting-row__text">
            <span className="setting-row__title">
              {isAiPaused ? (
                <BotOff className="w-3.5 h-3.5 inline align-[-2px] mr-1" aria-hidden="true" />
              ) : (
                <Bot className="w-3.5 h-3.5 inline align-[-2px] mr-1" aria-hidden="true" />
              )}
              agente IA {contactId ? '(contato)' : '(conversa)'}
            </span>
            <span className="setting-row__desc">{isAiPaused ? 'pausado' : 'ativo'}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isAiPaused}
            disabled={isPending}
            onClick={handleToggleAiPause}
            className={cn('toggle', isAiPaused && 'toggle--hitl', isPending && 'opacity-50 cursor-not-allowed')}
            title={
              isAiPaused
                ? contactId ? 'Reativar IA para este contato' : 'Reativar IA para esta conversa'
                : contactId ? 'Pausar IA para este contato' : 'Pausar IA para esta conversa'
            }
          />
        </div>
      </Section>

      {/* Estatísticas da conversa */}
      <Section title="conversa">
        <dl className="data-list">
          <InfoRow
            icon={MessageSquare}
            label="mensagens"
            value={`${messageCount} mensage${messageCount === 1 ? 'm' : 'ns'}`}
          />
          <InfoRow
            icon={Calendar}
            label="iniciada em"
            value={createdAt ? format(new Date(createdAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '-'}
          />
          <InfoRow
            icon={Clock}
            label="última mensagem"
            value={
              lastMessageAt
                ? formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true, locale: ptBR })
                : '-'
            }
          />
        </dl>
      </Section>

      {/* Tags (placeholder) */}
      <Section title="tags" defaultOpen={false}>
        <div className="chip-row">
          <span className="status-chip status-chip--muted">nenhuma tag</span>
        </div>
        <p className="meta" style={{ marginTop: 'var(--space-2)' }}>
          tags serão implementadas em uma versão futura.
        </p>
      </Section>
    </aside>
  );
});

export default ContactPanel;
