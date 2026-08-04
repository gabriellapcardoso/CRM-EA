/**
 * @fileoverview "Acontecendo agora" — feed do Dashboard (`.feed`/`.feed__item`).
 *
 * Combina duas fontes reais já existentes no app — nenhuma inventada:
 * - decisões pendentes da IA (`decisionQueueService`, mesma fonte do pill do
 *   shell) → `actor--pendente`, com link de aprovar (mesmo vocabulário do
 *   mock `ia(...).html`).
 * - atividades recentes (`useActivities`) → `actor--auto` quando é uma
 *   mudança de estágio automática (`STATUS_CHANGE`), `actor--humano` com
 *   iniciais do responsável nos demais casos.
 *
 * O mock (`dashboard.html`) também mostra um `actor--ia` ("agente respondeu
 * no Instagram") — não incluído aqui porque o schema de `Activity` real não
 * distingue hoje "resposta autônoma da IA" de "ação humana" (todo registro
 * nasce com `user.name` genérico, ver `lib/supabase/activities.ts`). Ver
 * REDESIGN-CRM.md / DESAFIOS.md.
 *
 * @module features/dashboard/components/RecentFeed
 */

import React from 'react';
import Link from 'next/link';
import type { Activity } from '@/types';
import type { Decision } from '@/features/decisions/types';

interface RecentFeedProps {
  activities: Activity[];
  decisions: Decision[];
  limit?: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatRelativeShort(dateString: string): string {
  const diffSeconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diffSeconds < 60) return 'agora';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} min`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} h`;
  return `${Math.floor(diffSeconds / 86400)} d`;
}

type FeedEntry =
  | { kind: 'decision'; date: string; decision: Decision }
  | { kind: 'activity'; date: string; activity: Activity };

export function RecentFeed({ activities, decisions, limit = 8 }: RecentFeedProps) {
  const entries: FeedEntry[] = [
    ...decisions.map((decision): FeedEntry => ({ kind: 'decision', date: decision.createdAt, decision })),
    ...activities.map((activity): FeedEntry => ({ kind: 'activity', date: activity.date, activity })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  if (entries.length === 0) {
    return (
      <div className="state-empty">
        <p className="state-empty__text">nada por aqui ainda — as próximas atividades e decisões da IA aparecem neste feed.</p>
      </div>
    );
  }

  return (
    <ul className="feed">
      {entries.map((entry) => {
        if (entry.kind === 'decision') {
          const { decision } = entry;
          return (
            <li className="feed__item" key={`decision-${decision.id}`}>
              <span className="actor actor--pendente actor--sm" aria-hidden="true">!</span>
              <div className="feed__body">
                <p className="feed__text">{decision.title}</p>
                <p className="feed__meta">precisa de você · {formatRelativeShort(decision.createdAt)}</p>
              </div>
              <Link className="tag-pending" href="/decisions">aprovar</Link>
            </li>
          );
        }

        const { activity } = entry;
        const isAuto = activity.type === 'STATUS_CHANGE';
        return (
          <li className="feed__item" key={`activity-${activity.id}`}>
            <span className={`actor ${isAuto ? 'actor--auto' : 'actor--humano'} actor--sm`} aria-hidden="true">
              {isAuto ? '⚡' : getInitials(activity.user.name)}
            </span>
            <div className="feed__body">
              <p className="feed__text">
                {activity.title}
                {activity.dealTitle ? ` · ${activity.dealTitle}` : ''}
              </p>
              <p className="feed__meta">{isAuto ? 'automático' : activity.user.name} · {formatRelativeShort(activity.date)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default RecentFeed;
