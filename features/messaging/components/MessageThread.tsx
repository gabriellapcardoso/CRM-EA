'use client';

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PresenceIndicator } from './PresenceIndicator';
import { MessageBubble } from './MessageBubble';
import { useMessagesInfinite } from '@/lib/query/hooks/useMessagesQuery';
import type { ChannelType, MessagingMessage } from '@/lib/messaging/types';

interface MessageThreadProps {
  conversationId: string;
  /** Contact presence status from useContactPresence */
  presenceStatus?: 'online' | 'typing' | 'recording' | 'offline';
  onReply?: (message: MessagingMessage) => void;
  /** Canal da conversa — repassado ao `.message__meta` de cada bolha. */
  channelType?: ChannelType;
}

function DateDivider({ date }: { date: Date }) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let label: string;
  if (isSameDay(date, today)) {
    label = 'hoje';
  } else if (isSameDay(date, yesterday)) {
    label = 'ontem';
  } else {
    label = format(date, "d 'de' MMMM", { locale: ptBR });
  }

  return <li className="thread__daymark">{label}</li>;
}

export function MessageThread({ conversationId, presenceStatus, onReply, channelType }: MessageThreadProps) {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMessagesInfinite(conversationId);

  const scrollRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const isLoadingOlderRef = useRef(false);

  // Flatten pages into single message array (chronological order).
  // Filter out reaction messages — they are displayed as pills on the target
  // message bubble, not as standalone bubbles in the thread.
  const messages = (data?.pages.flatMap((p) => p.messages) ?? []).filter(
    (m) => m.contentType !== 'reaction',
  );

  // Scroll to bottom on new messages (not when loading older)
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && !isLoadingOlderRef.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: prevMessagesLengthRef.current === 0 ? 'auto' : 'smooth',
      });
    }
    isLoadingOlderRef.current = false;
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // IntersectionObserver on sentinel to trigger loading older messages
  const handleSentinel = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        const el = scrollRef.current;
        const prevScrollHeight = el?.scrollHeight || 0;

        isLoadingOlderRef.current = true;
        fetchNextPage().then(() => {
          // Preserve scroll position after loading older messages
          requestAnimationFrame(() => {
            if (el) {
              const newScrollHeight = el.scrollHeight;
              el.scrollTop += newScrollHeight - prevScrollHeight;
            }
          });
        });
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleSentinel, {
      root: scrollRef.current,
      threshold: 0.1,
    });
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [handleSentinel]);

  // Group messages by date — must be before early returns (Rules of Hooks)
  const messagesWithDates = useMemo(() => {
    const result: Array<
      { type: 'date'; date: Date } | { type: 'message'; message: MessagingMessage }
    > = [];
    let lastDate: string | null = null;

    messages.forEach((message) => {
      const messageDate = new Date(message.createdAt);
      const dateKey = format(messageDate, 'yyyy-MM-dd');

      if (dateKey !== lastDate) {
        result.push({ type: 'date', date: messageDate });
        lastDate = dateKey;
      }
      result.push({ type: 'message', message });
    });

    return result;
  }, [messages]);

  if (isLoading) {
    return (
      <div className="thread__body">
        <div className="skeleton-stack">
          <span className="skeleton skeleton--card" style={{ display: 'block', width: '55%' }} />
          <span className="skeleton skeleton--card" style={{ display: 'block', width: '45%', alignSelf: 'flex-end' }} />
          <span className="skeleton skeleton--card" style={{ display: 'block', width: '60%' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="thread__body">
        <div className="banner banner--error">
          <span className="dot" />
          <span className="banner__text">Erro ao carregar mensagens</span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="thread__body">
        <div className="state-empty">
          <h3 className="state-empty__title">
            conversa nova<span className="dot-accent">.</span>
          </h3>
          <p className="state-empty__text">
            nenhuma mensagem ainda — escreva abaixo para iniciar a conversa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Mensagens da conversa"
      className="thread__body"
    >
      {/* Sentinel for loading older messages */}
      <li ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

      {isFetchingNextPage && (
        <li className="loading-more">
          <span className="spinner" aria-hidden="true" />
          carregando mensagens anteriores…
        </li>
      )}

      {messagesWithDates.map((item) => {
        if (item.type === 'date') {
          return <DateDivider key={`date-${format(item.date, 'yyyy-MM-dd')}`} date={item.date} />;
        }
        return (
          <MessageBubble
            key={item.message.id}
            message={item.message}
            conversationId={conversationId}
            allMessages={messages}
            onReply={onReply}
            channelType={channelType}
          />
        );
      })}

      {/* Typing / recording indicator */}
      {presenceStatus && presenceStatus !== 'offline' && presenceStatus !== 'online' && (
        <li className="message">
          <span className="typing" aria-label={presenceStatus === 'recording' ? 'gravando áudio' : 'digitando'}>
            <span /><span /><span />
          </span>
          <span className="message__time">
            <PresenceIndicator status={presenceStatus} showLabel size="md" />
          </span>
        </li>
      )}
    </ul>
  );
}
