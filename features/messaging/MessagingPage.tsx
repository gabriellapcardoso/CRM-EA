'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MessageSquare, User, CheckCircle, MoreVertical, LinkIcon, Trash2, RotateCcw, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ConversationList } from './components/ConversationList';
import { MessageThread } from './components/MessageThread';
import { MessageInput } from './components/MessageInput';
import { ContactPanel } from './components/ContactPanel';
import { ContactLinkModal } from './components/Modals/ContactLinkModal';
import { ChannelIndicator } from './components/ChannelIndicator';
import { WindowExpiryBadge } from './components/WindowExpiryBadge';
import { MessageSearchBar } from './components/MessageSearchBar';
import { AssignmentDropdown } from './components/AssignmentDropdown';
import {
  useConversation,
  useMarkConversationRead,
  useResolveConversation,
  useReopenConversation,
  useDeleteConversation,
  addPendingDeletion,
  removePendingDeletion,
} from '@/lib/query/hooks/useConversationsQuery';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Modal } from '@/components/ui/Modal';
import { useRealtimeSyncMessaging } from '@/lib/realtime/useRealtimeSync';
import { queryKeys, entityCachesExceptDetail } from '@/lib/query';
import { useContactPresence } from '@/lib/messaging/hooks/useContactPresence';
import type { ConversationView } from '@/lib/messaging/types';

interface MessagingPageProps {
  initialConversationId?: string;
}

export function MessagingPage({ initialConversationId }: MessagingPageProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationIdParam = searchParams.get('id');
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { getPresence } = useContactPresence();

  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(
    initialConversationId || conversationIdParam || undefined
  );
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<import('@/lib/messaging/types').MessagingMessage | null>(null);

  // Subscribe to realtime updates
  useRealtimeSyncMessaging();

  // Fetch selected conversation details
  const { data: selectedConversation, isLoading: isConversationLoading } = useConversation(selectedConversationId);

  // Mutations
  const { mutate: markAsRead } = useMarkConversationRead();
  const { mutate: resolveConversation } = useResolveConversation();
  const { mutate: reopenConversation } = useReopenConversation();
  const { mutate: deleteConversation, isPending: isDeleting } = useDeleteConversation();

  /**
   * Escreve a conversa selecionada na URL.
   *
   * Usa `window.history` em vez de `router.push`/`router.replace` porque
   * `/messaging` é **prerenderizada como estática** (`○ /messaging` na saída do
   * build). Em rota estática, navegar para a mesma rota com outro `searchParam`
   * faz o roteador do cliente reconciliar a URL de volta para a entrada
   * prerenderizada: o `push` some do histórico e no lugar dele aparece um
   * `replace` com o id ANTERIOR. Verificado instrumentando `history.pushState`
   * em produção — a conversa trocava na tela e a URL ficava congelada na
   * primeira conversa aberta depois de cada carregamento. Recarregar levava a
   * pessoa pra conversa errada, e copiar o link compartilhava a errada.
   *
   * `pushState`/`replaceState` são o caminho documentado do App Router para
   * refletir estado do cliente na URL sem navegação de servidor, e continuam
   * em sincronia com `useSearchParams`.
   */
  const escreverConversaNaURL = useCallback(
    (id: string | undefined, modo: 'push' | 'replace' = 'push') => {
      const url = id ? `/messaging?id=${id}` : '/messaging';
      if (modo === 'replace') {
        window.history.replaceState(null, '', url);
      } else {
        window.history.pushState(null, '', url);
      }
    },
    [],
  );

  // Handle delete conversation
  const handleDeleteConversation = useCallback(() => {
    if (!selectedConversationId) return;

    const idToDelete = selectedConversationId;
    // Mark as pending deletion BEFORE any state updates so the select filter in
    // useConversations immediately starts filtering this ID. This prevents stale
    // refetches (e.g. from markAsRead.onSettled) from re-adding the conversation
    // to the list while the delete mutation is in-flight.
    addPendingDeletion(idToDelete);
    // Safety fallback: if the realtime DELETE event never arrives (network issue, etc.),
    // ensure the guard is eventually cleared so the pending-deletion filter doesn't persist.
    setTimeout(() => removePendingDeletion(idToDelete), 10_000);
    // Clear selection immediately so useConversation becomes disabled (enabled: false)
    // before invalidation or realtime events trigger a refetch of the deleted conversation
    setSelectedConversationId(undefined);
    setShowDeleteConfirm(false);
    escreverConversaNaURL(undefined);

    // Cancel in-flight refetches so they don't overwrite the optimistic removal below
    queryClient.cancelQueries({ predicate: entityCachesExceptDetail('messagingConversations') });

    // Optimistically remove from list cache immediately
    queryClient.setQueriesData(
      { queryKey: queryKeys.messagingConversations.all },
      (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return (old as ConversationView[]).filter((conv) => conv.id !== idToDelete);
      }
    );

    deleteConversation(idToDelete);
  }, [selectedConversationId, deleteConversation, escreverConversaNaURL, queryClient]);

  // Clear URL if conversation was deleted or not found
  useEffect(() => {
    if (selectedConversationId && selectedConversation === null && !isConversationLoading) {
      setSelectedConversationId(undefined);
      escreverConversaNaURL(undefined, 'replace');
    }
  }, [selectedConversationId, selectedConversation, isConversationLoading, escreverConversaNaURL]);

  // Mark as read when opening a conversation
  useEffect(() => {
    if (selectedConversationId && selectedConversation && selectedConversation.unreadCount > 0) {
      markAsRead(selectedConversationId);
    }
  }, [selectedConversationId, selectedConversation, markAsRead]);


  // Update URL when conversation changes
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setShowSearch(false);
    escreverConversaNaURL(id);
  }, [escreverConversaNaURL]);

  // Link conversation to contact
  const handleLinkContact = useCallback(async (contactId: string) => {
    if (!selectedConversationId) return;

    const { error } = await supabase
      .from('messaging_conversations')
      .update({ contact_id: contactId })
      .eq('id', selectedConversationId);

    if (error) throw error;

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({
      predicate: entityCachesExceptDetail('messagingConversations'),
    });
  }, [selectedConversationId, queryClient]);

  // Create contact and link
  const handleCreateContact = useCallback(async (params: { name: string; phone?: string }) => {
    if (!profile?.organization_id) throw new Error('Organization not found');

    const { data: contact, error: createError } = await supabase
      .from('contacts')
      .insert({
        name: params.name,
        phone: params.phone,
        organization_id: profile.organization_id,
      })
      .select('id')
      .single();

    if (createError) throw createError;
    return contact.id;
  }, [profile?.organization_id]);

  // View contact in CRM
  const handleViewContact = useCallback((contactId: string) => {
    router.push(`/contacts?id=${contactId}`);
  }, [router]);

  // View deals for contact
  const handleViewDeals = useCallback((contactId: string) => {
    router.push(`/boards?contact=${contactId}`);
  }, [router]);

  const headerName = selectedConversation
    ? selectedConversation.contactName || selectedConversation.externalContactName || 'Contato desconhecido'
    : '';
  const headerAvatar = selectedConversation
    ? sanitizeUrl(selectedConversation.externalContactAvatar)
    : '';

  return (
    <div className="inbox">
      {/* Lista de conversas */}
      <ConversationList
        selectedId={selectedConversationId}
        onSelect={handleSelectConversation}
        getPresence={getPresence}
      />

      {/* Conversa */}
      <div className="thread">
        {selectedConversation ? (
          <>
            <header className="thread__head">
              <span className="relative flex-shrink-0">
                {headerAvatar ? (
                  <img
                    src={headerAvatar}
                    alt={headerName}
                    className="avatar avatar--md"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <span className="avatar avatar--md avatar--purple">
                    <User className="w-4 h-4" aria-hidden="true" />
                  </span>
                )}
                <span style={{ position: 'absolute', right: -3, bottom: -3 }}>
                  <ChannelIndicator type={selectedConversation.channelType} size="sm" />
                </span>
              </span>
              <div className="min-w-0">
                <h2 className="thread__name truncate">{headerName}</h2>
                <p className="thread__sub flex items-center gap-2">
                  {selectedConversation.channelName}
                  <WindowExpiryBadge
                    windowExpiresAt={selectedConversation.windowExpiresAt}
                    variant="inline"
                  />
                </p>
              </div>
              <span className="spacer" />
              <AssignmentDropdown
                conversationId={selectedConversation.id}
                assignedUserId={selectedConversation.assignedUserId}
              />
              <button
                type="button"
                onClick={() => setShowSearch((v) => !v)}
                className={cn('btn btn--ghost', showSearch && 'chip--ia')}
                title="Buscar mensagens"
                aria-label="Buscar mensagens"
              >
                <Search className="w-4 h-4" aria-hidden="true" />
              </button>
              {selectedConversation.status === 'open' && (
                <button
                  type="button"
                  onClick={() => resolveConversation(selectedConversation.id)}
                  className="btn btn--ghost"
                  title="Marcar como resolvida"
                  aria-label="Marcar como resolvida"
                >
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              {!selectedConversation.contactId && (
                <button
                  type="button"
                  onClick={() => setIsLinkModalOpen(true)}
                  className="btn btn--ghost"
                  title="Vincular contato"
                  aria-label="Vincular contato"
                >
                  <LinkIcon className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="btn btn--ghost" aria-label="Mais ações">
                    <MoreVertical className="w-4 h-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {selectedConversation.status === 'resolved' && (
                    <DropdownMenuItem
                      onClick={() => reopenConversation(selectedConversation.id)}
                      className="gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reabrir conversa
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteConfirm(true)}
                    className="gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir conversa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            {/* Search Bar */}
            {showSearch && (
              <MessageSearchBar
                conversationId={selectedConversation.id}
                onClose={() => setShowSearch(false)}
              />
            )}

            {/* Messages */}
            <MessageThread
              conversationId={selectedConversation.id}
              channelType={selectedConversation.channelType}
              presenceStatus={selectedConversation.contactId ? getPresence(selectedConversation.contactId) : undefined}
              onReply={setReplyToMessage}
            />

            {/* Input */}
            <MessageInput
              conversation={selectedConversation}
              replyTo={replyToMessage}
              onCancelReply={() => setReplyToMessage(null)}
            />
          </>
        ) : (
          <div className="thread__body">
            <div className="state-empty">
              <h3 className="state-empty__title">
                nenhuma conversa aberta<span className="dot-accent">.</span>
              </h3>
              <p className="state-empty__text">
                escolha uma conversa na lista à esquerda para ver o histórico dos 3 canais.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Painel de contexto */}
      <ContactPanel
        conversation={selectedConversation}
        isLoading={isConversationLoading && !!selectedConversationId}
        onLinkContact={() => setIsLinkModalOpen(true)}
        onViewContact={handleViewContact}
        onViewDeals={handleViewDeals}
      />

      {/* Contact Link Modal */}
      <ContactLinkModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onLinkContact={handleLinkContact}
        onCreateContact={handleCreateContact}
        currentContactId={selectedConversation?.contactId}
        suggestedPhone={selectedConversation?.contactPhone || undefined}
        suggestedName={selectedConversation?.externalContactName || undefined}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Excluir conversa"
        size="sm"
      >
        <div className="panel__body">
          <p>
            Tem certeza que deseja excluir esta conversa? Todas as mensagens serão perdidas permanentemente.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="btn btn--ghost"
              disabled={isDeleting}
            >
              cancelar
            </button>
            <button
              type="button"
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className="btn btn--danger"
            >
              {isDeleting ? 'excluindo…' : 'excluir'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
