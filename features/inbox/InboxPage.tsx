'use client'

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useInboxController, type AISuggestion, type FocusItem } from './hooks/useInboxController';
import { ViewModeToggle } from './components/ViewModeToggle';
import { InboxOverviewView } from './components/InboxOverviewView';
import { InboxListView } from './components/InboxListView';
import { InboxFocusView } from './components/InboxFocusView';
import { DebugFillButton } from '@/components/debug/DebugFillButton';
import type { Activity } from '@/types';

/** Rótulo/preview de um item da fila de triagem, seja atividade ou sugestão da IA. */
function describeFocusItem(item: FocusItem): {
  title: string;
  org?: string;
  preview?: string;
  badge: { letter: string; color: string; label: string };
  fromAI: boolean;
} {
  if (item.type === 'suggestion') {
    const s = item.data as AISuggestion;
    return {
      title: s.title,
      org: s.data.deal?.title ?? s.data.contact?.name,
      preview: s.description,
      badge: { letter: '✦', color: 'var(--purple-700)', label: 'Sugestão da IA' },
      fromAI: true,
    };
  }

  const a = item.data as Activity;
  return {
    title: a.title,
    org: a.dealTitle,
    preview: a.description,
    badge: { letter: 'A', color: 'var(--ink-500)', label: 'Atividade' },
    fromAI: false,
  };
}

/**
 * Inbox — triagem/priorização, full-bleed dentro de `.screen`.
 *
 * Adaptação do mock `inbox.html` (que só descreve a conversa multicanal) para
 * a feature real de triagem: `.conv-pane` à esquerda vira a fila de trabalho
 * (modos de visão em `.chip` + itens em `.card-conv`) e o painel central `.thread`
 * hospeda o modo de visão ativo (visão geral / lista / foco), que o mock não cobre
 * e que foi preservado.
 */
export const InboxPage: React.FC = () => {
  const router = useRouter();

  // Controla “intenção” ao abrir a Lista (ex.: abrir já com sugestões expandidas)
  const [listPreset, setListPreset] = useState<'default' | 'suggestions-expanded'>('default');

  const {
    // View Mode
    viewMode,
    setViewMode,

    // Atividades
    overdueActivities,
    todayMeetings,
    todayTasks,
    upcomingActivities,

    // Sugestões IA
    aiSuggestions,

    // Focus Mode
    focusQueue,
    focusIndex,
    setFocusIndex,
    currentFocusItem,
    handleFocusNext,
    handleFocusPrev,
    handleFocusSkip,
    handleFocusDone,
    handleFocusSnooze,

    // Handlers Atividades
    handleCompleteActivity,
    handleSnoozeActivity,
    handleDiscardActivity,

    // Handlers Sugestões
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleSnoozeSuggestion,
    seedInboxDebug,
  } = useInboxController();

  const listDefaults = useMemo(
    () => ({
      suggestionsDefaultOpen: true,
      suggestionsDefaultShowAll: listPreset === 'suggestions-expanded',
    }),
    [listPreset]
  );

  const todayTotal = todayMeetings.length + todayTasks.length;

  const headerSub = viewMode === 'overview'
    ? 'diagnóstico do dia'
    : viewMode === 'list'
      ? 'tudo que está na sua mesa'
      : `item ${Math.min(focusIndex + 1, focusQueue.length)} de ${focusQueue.length}`;

  return (
    <div className="inbox">
      {/* Fila de trabalho */}
      <div className="conv-pane">
        <div className="conv-pane__head">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <div className="chip-row">
            <span className="chip">atrasados<span className="badge-count">{overdueActivities.length}</span></span>
            <span className="chip">hoje<span className="badge-count">{todayTotal}</span></span>
            <span className="chip chip--ia">IA<span className="badge-count">{aiSuggestions.length}</span></span>
          </div>
          <DebugFillButton onClick={seedInboxDebug} label="Seed Inbox" variant="secondary" />
        </div>

        <ul className="conv-list">
          {focusQueue.length === 0 ? (
            <li className="state-empty">
              <p className="state-empty__text">nada na fila — inbox zerada.</p>
            </li>
          ) : (
            focusQueue.map((item, index) => {
              const info = describeFocusItem(item);
              const isActive = viewMode === 'focus' && index === focusIndex;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusIndex(index);
                      setViewMode('focus');
                    }}
                    className={cn('card-conv w-full text-left', isActive && 'card-conv--active')}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <span className="card-conv__avatar">
                      <span className={cn('avatar avatar--md', info.fromAI ? 'avatar--purple' : 'avatar--muted')}>
                        {index + 1}
                      </span>
                      <span
                        className="badge-channel badge-channel--sm"
                        style={{ background: info.badge.color }}
                        title={info.badge.label}
                      >
                        {info.badge.letter}
                      </span>
                    </span>
                    <span className="card-conv__body">
                      <span className="card-conv__top">
                        <span className="card-conv__name">{info.title}</span>
                      </span>
                      {info.org && <span className="card-conv__org">{info.org}</span>}
                      {info.preview && <span className="card-conv__preview">{info.preview}</span>}
                      {info.fromAI && (
                        <span className="tag-pending" style={{ marginTop: 6 }}>sugestão da IA</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Painel principal — hospeda o modo de visão ativo */}
      <div className="thread">
        <header className="thread__head">
          <div>
            <h1 className="thread__name">Inbox</h1>
            <p className="thread__sub">{headerSub}</p>
          </div>
          <span className="spacer" />
          {viewMode !== 'focus' && focusQueue.length > 0 && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setFocusIndex(0);
                setViewMode('focus');
              }}
            >
              começar foco
            </button>
          )}
        </header>

        <div className="thread__body">
          {viewMode === 'overview' ? (
            <InboxOverviewView
              overdueActivities={overdueActivities}
              todayMeetings={todayMeetings}
              todayTasks={todayTasks}
              upcomingActivities={upcomingActivities}
              aiSuggestions={aiSuggestions}
              onGoToList={() => {
                setListPreset('default');
                setViewMode('list');
              }}
              onStartFocus={() => {
                setFocusIndex(0);
                setViewMode('focus');
              }}
              onAcceptSuggestion={handleAcceptSuggestion}

              onOpenOverdue={() => router.push('/activities?filter=overdue')}
              onOpenToday={() => router.push('/activities?filter=today')}
              onOpenCriticalSuggestions={() => {
                setListPreset('suggestions-expanded');
                setViewMode('list');
              }}
              onOpenPending={() => {
                setListPreset('default');
                setViewMode('list');
              }}
            />
          ) : viewMode === 'list' ? (
            <InboxListView
              overdueActivities={overdueActivities}
              todayMeetings={todayMeetings}
              todayTasks={todayTasks}
              upcomingActivities={upcomingActivities}
              aiSuggestions={aiSuggestions}
              onCompleteActivity={handleCompleteActivity}
              onSnoozeActivity={handleSnoozeActivity}
              onDiscardActivity={handleDiscardActivity}
              onAcceptSuggestion={handleAcceptSuggestion}
              onDismissSuggestion={handleDismissSuggestion}
              onSnoozeSuggestion={handleSnoozeSuggestion}
              suggestionsDefaultOpen={listDefaults.suggestionsDefaultOpen}
              suggestionsDefaultShowAll={listDefaults.suggestionsDefaultShowAll}
              onSelectActivity={(id) => {
                const index = focusQueue.findIndex(item => item.id === id);
                if (index !== -1) {
                  setFocusIndex(index);
                  setViewMode('focus');
                }
              }}
            />
          ) : (
            <InboxFocusView
              currentItem={currentFocusItem}
              currentIndex={focusIndex}
              totalItems={focusQueue.length}
              onDone={handleFocusDone}
              onSnooze={handleFocusSnooze}
              onSkip={handleFocusSkip}
              onPrev={handleFocusPrev}
              onNext={handleFocusNext}
            />
          )}
        </div>
      </div>
    </div>
  );
};
