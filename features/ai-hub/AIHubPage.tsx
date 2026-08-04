'use client'

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Bot, User, Sparkles, StopCircle, Trash2, Settings, AlertCircle } from 'lucide-react';
import { useCRMAgent, AgentMessage } from './hooks/useCRMAgent';
import { useOrgSettings } from '@/lib/query/hooks/useOrgSettingsQuery';

// Componente de mensagem individual
const ChatMessage: React.FC<{ message: AgentMessage }> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser
          ? 'bg-primary-500 text-white'
          : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white'
        }`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Conteúdo */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block px-4 py-3 rounded-2xl ${isUser
            ? 'bg-primary-500 text-white rounded-br-md'
            : 'bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-bl-md'
          }`}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>
        </div>
      </div>
    </div>
  );
};

// Indicador de digitação
const TypingIndicator: React.FC = () => (
  <div className="flex gap-3">
    <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center">
      <Bot size={16} />
    </div>
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 px-4 py-3 rounded-2xl rounded-bl-md">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

// Welcome message
const WelcomeMessage: React.FC = () => (
  <div className="text-center py-12">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white mb-4">
      <Sparkles size={32} />
    </div>
    <h2 className="title-lg mb-2">Olá! Sou seu assistente de CRM</h2>
    <p className="muted max-w-md mx-auto mb-6">
      Posso ajudar você a gerenciar deals, atividades, contatos e muito mais.
      Experimente perguntar algo!
    </p>
    <div className="chip-row justify-center">
      {[
        'O que tenho pra fazer hoje?',
        'Mostre meu pipeline',
        'Quais deals estão parados?',
        'Crie uma reunião com Stark amanhã às 14h',
      ].map((suggestion) => (
        <button key={suggestion} type="button" className="chip">
          {suggestion}
        </button>
      ))}
    </div>
  </div>
);

// Componente de bloqueio quando API não está configurada
const APINotConfigured: React.FC = () => {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] max-w-lg mx-auto px-4">
      <div className="text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white mb-6 shadow-lg shadow-orange-500/30">
          <AlertCircle size={40} />
        </div>

        {/* Title */}
        <h1 className="title-lg mb-3">Configure a Inteligência Artificial</h1>

        {/* Description */}
        <p className="muted mb-8 leading-relaxed">
          Para usar o assistente de IA, você precisa configurar uma chave de API.
          Suportamos <strong>Google Gemini</strong>, <strong>OpenAI</strong> e <strong>Anthropic</strong>.
        </p>

        {/* Card with instructions */}
        <div className="panel mb-6 text-left">
          <h3 className="title-sm mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-purple-500" />
            Como configurar:
          </h3>
          <ol className="space-y-2 text-sm muted">
            <li className="flex gap-2">
              <span className="font-bold text-purple-500">1.</span>
              Acesse as Configurações
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-purple-500">2.</span>
              Vá em "Inteligência Artificial"
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-purple-500">3.</span>
              Escolha um provedor e insira sua API Key
            </li>
          </ol>
        </div>

        {/* CTA Button */}
        <button onClick={() => router.push('/settings/ai#ai-config')} className="btn btn--primary btn--lg">
          <Settings size={18} />
          Ir para Configurações
        </button>
      </div>
    </div>
  );
};

/**
 * Componente React `AIHubPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const AIHubPage: React.FC = () => {
  const router = useRouter();
  const { data: settings } = useOrgSettings();
  const hasApiKey = Boolean(settings?.aiKeyConfigured);
  const { messages, isLoading, error, sendMessage, clearMessages, stopGeneration } = useCRMAgent();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Foco no input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput('');
    await sendMessage(message);
  };

  const handleSuggestionClick = async (suggestion: string) => {
    setInput('');
    await sendMessage(suggestion);
  };

  // Se não tem API key, mostra tela de bloqueio
  if (!hasApiKey) {
    return <APINotConfigured />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <Bot size={20} />
          </div>
          <div>
            <h1 className="title-sm">AI Assistant</h1>
            <p className="meta">Gemini 2.5 Flash • Multi-step Agentic</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button onClick={clearMessages} className="btn btn--ghost" title="Limpar conversa">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 ? (
          <WelcomeMessage />
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <TypingIndicator />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 mb-4 banner banner--error">
          <span className="banner__text">{error.message}</span>
        </div>
      )}

      {/* Suggestions when empty */}
      {messages.length === 0 && (
        <div className="px-4 pb-4">
          <div className="chip-row justify-center">
            {[
              'O que tenho pra fazer hoje?',
              'Mostre meu pipeline',
              'Quais deals estão parados?',
            ].map((suggestion) => (
              <button key={suggestion} type="button" className="chip" onClick={() => handleSuggestionClick(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="px-4 pb-4">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-center gap-2 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte algo sobre seu CRM..."
              className="flex-1 px-4 py-3 bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400"
              disabled={isLoading}
            />

            {isLoading ? (
              <button type="button" onClick={stopGeneration} className="btn btn--danger m-1.5" style={{ padding: 8, borderRadius: 12 }}>
                <StopCircle size={20} />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="btn btn--primary m-1.5" style={{ padding: 8, borderRadius: 12 }}>
                <Send size={20} />
              </button>
            )}
          </div>
        </form>

        <p className="text-center text-xs text-slate-400 mt-2">
          Powered by Gemini 2.5 Flash • Respostas podem conter imprecisões
        </p>
      </div>
    </div>
  );
};

export default AIHubPage;
