'use client';

/**
 * @fileoverview Message Search Bar
 *
 * Barra de busca de mensagens dentro de uma conversa.
 * Exibe resultados em um dropdown com preview e navegação.
 *
 * @module features/messaging/components/MessageSearchBar
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useSearchMessagesQuery } from '@/lib/query/hooks/useSearchMessagesQuery';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MessageSearchBarProps {
  conversationId: string;
  onClose: () => void;
  onResultClick?: (messageId: string) => void;
}

export function MessageSearchBar({
  conversationId,
  onClose,
  onResultClick,
}: MessageSearchBarProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { data: results, isLoading } = useSearchMessagesQuery(conversationId, query);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div
      style={{
        background: 'var(--surface-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: 'var(--space-2) 18px',
      }}
    >
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <label className="sr-only" htmlFor="message-search">Buscar nas mensagens</label>
        <input
          ref={inputRef}
          id="message-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="buscar nas mensagens…"
          className="input"
        />
        {isLoading && <span className="spinner" aria-hidden="true" />}
        <button type="button" onClick={onClose} className="btn btn--quiet" aria-label="Fechar busca">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Results dropdown */}
      {query.length >= 2 && results && results.length > 0 && (
        <ul className="conv-list" style={{ maxHeight: 256, padding: 0, marginTop: 'var(--space-2)' }}>
          {results.map((msg) => (
            <li key={msg.id}>
              <button
                type="button"
                onClick={() => onResultClick?.(msg.id)}
                className="card-conv w-full text-left"
              >
                <span className="card-conv__body">
                  <span className="card-conv__top">
                    <span className="card-conv__name">
                      {msg.sender_name || (msg.direction === 'inbound' ? 'Contato' : 'Você')}
                    </span>
                    <span className="card-conv__time">
                      {format(new Date(msg.created_at), 'd MMM, HH:mm', { locale: ptBR })}
                    </span>
                  </span>
                  <span className="card-conv__preview">
                    {highlightMatch(msg.content?.text || '', query)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.length >= 2 && results && results.length === 0 && !isLoading && (
        <p className="meta" style={{ textAlign: 'center', paddingTop: 'var(--space-2)' }}>
          nenhuma mensagem encontrada
        </p>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <>
      {before}
      <mark style={{ background: 'var(--hitl-surface)', color: 'inherit', borderRadius: 3, padding: '0 2px' }}>
        {match}
      </mark>
      {after}
    </>
  );
}
