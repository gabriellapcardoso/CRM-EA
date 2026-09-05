'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity as ActivityIcon,
  CalendarClock,
  Copy,
  Inbox,
  MessageCircle,
  Mic,
  Phone,
  X,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useDealsView, useUpdateDeal as useUpdateDealMut } from '@/lib/query/hooks/useDealsQuery';
import { useContacts } from '@/lib/query/hooks/useContactsQuery';
import { useBoards } from '@/lib/query/hooks/useBoardsQuery';
import { useActivities, useCreateActivity } from '@/lib/query/hooks/useActivitiesQuery';
import { useMoveDealSimple } from '@/lib/query/hooks';
import { resolverOrigem } from '@/lib/navigation/origem';
import { normalizePhoneE164 } from '@/lib/phone';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { buildStageGroupMap } from '@/features/boards/stageGroups';
import { getInitials } from '@/features/boards/cardFormat';

import { useAIDealAnalysis, deriveHealthFromProbability, describeAIError } from '@/features/inbox/hooks/useAIDealAnalysis';
import { useDealNotes } from '@/features/inbox/hooks/useDealNotes';
import { useDealFiles } from '@/features/inbox/hooks/useDealFiles';
import { useQuickScripts } from '@/features/inbox/hooks/useQuickScripts';

import { UIChat } from '@/components/ai/UIChat';
import { CallModal, type CallLogData } from '@/features/inbox/components/CallModal';
import { MessageComposerModal, type MessageChannel, type MessageExecutedEvent } from '@/features/inbox/components/MessageComposerModal';
import { ScheduleModal, type ScheduleData, type ScheduleType } from '@/features/inbox/components/ScheduleModal';

import type { QuickScript, ScriptCategory } from '@/lib/supabase/quickScripts';
import type { Activity, Board, BoardStage, Contact, DealView } from '@/types';

type Tab = 'chat' | 'notas' | 'scripts' | 'arquivos';

// Performance: reuse Intl formatter instances (avoid creating them per call).
const PT_BR_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR');
const PT_BR_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

type StageTone = 'blue' | 'violet' | 'amber' | 'green' | 'slate';

type Stage = {
  id: string;
  label: string;
  tone: StageTone;
  rawColor?: string;
};

type TimelineItem = {
  id: string;
  at: string;
  kind: 'status' | 'call' | 'note' | 'system';
  title: string;
  subtitle?: string;
  tone?: 'success' | 'danger' | 'neutral';
};

type ToastTone = 'neutral' | 'success' | 'danger';
type ToastState = { id: string; message: string; tone: ToastTone };

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type TemplatePickerMode = 'WHATSAPP' | 'EMAIL';

type MessageLogContext = {
  source: 'template' | 'generated' | 'manual';
  origin: 'nextBestAction' | 'quickAction';
  template?: { id: string; title: string };
  aiSuggested?: boolean;
  aiActionType?: string;
};

function hashString(input: string): string {
  // Djb2-ish hash para dedupe leve (não criptográfico)
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

function humanizeTestLabel(input: string | null | undefined) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';

  // Remove sufixos de dados de teste gerados automaticamente (ex.: "next-ai_<uuid>")
  return raw.replace(/\s*next-ai[_-][0-9a-f-]{8,}\s*$/i, '').trim();
}

function buildExecutionHeader(opts: {
  channel: 'WHATSAPP' | 'EMAIL';
  context?: MessageLogContext | null;
  outsideCRM?: boolean;
}) {
  const lines: string[] = [];
  lines.push('Fonte: Cockpit');
  lines.push(`Canal: ${opts.channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}`);

  if (opts.outsideCRM) {
    lines.push('Fora do CRM: sim');
  }

  const ctx = opts.context;
  if (ctx) {
    const originLabel = ctx.origin === 'nextBestAction' ? 'Próxima ação' : 'Ação rápida';
    lines.push(`Origem: ${originLabel}`);
    lines.push(`Geração: ${ctx.source === 'template' ? 'Template' : ctx.source === 'generated' ? 'Gerado' : 'Manual'}`);
    if (ctx.template) {
      lines.push(`Template: ${ctx.template.title} (${ctx.template.id})`);
    }
    if (typeof ctx.aiSuggested === 'boolean') {
      lines.push(`Sugerido por IA: ${ctx.aiSuggested ? 'sim' : 'não'}`);
    }
    if (ctx.aiActionType) {
      lines.push(`Tipo IA: ${ctx.aiActionType}`);
    }
  }

  return lines.join('\n');
}

function pickEmailPrefill(applied: string, fallbackSubject: string): { subject: string; body: string } {
  const lines = applied.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*(assunto|subject)\s*:\s*/i.test(l));

  if (idx >= 0) {
    const raw = lines[idx] ?? '';
    const subject = raw.replace(/^\s*(assunto|subject)\s*:\s*/i, '').trim() || fallbackSubject;
    const body = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join('\n').trim();
    return { subject, body };
  }

  return { subject: fallbackSubject, body: applied.trim() };
}

function TemplatePickerModal({
  isOpen,
  onClose,
  mode,
  scripts,
  isLoading,
  variables,
  applyVariables,
  getCategoryInfo,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  mode: TemplatePickerMode;
  scripts: QuickScript[];
  isLoading: boolean;
  variables: Record<string, string>;
  applyVariables: (template: string, vars: Record<string, string>) => string;
  getCategoryInfo: (cat: ScriptCategory) => { label: string; color: string };
  onPick: (script: QuickScript) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ScriptCategory>('all');

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setCategory('all');
  }, [isOpen, mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = category === 'all' ? scripts : scripts.filter((s) => s.category === category);
    if (!q) return base;
    return base.filter((s) => {
      const hay = `${s.title}\n${s.template}`.toLowerCase();
      return hay.includes(q);
    });
  }, [category, query, scripts]);

  const title = mode === 'WHATSAPP' ? 'Templates · WhatsApp' : 'Templates · E-mail';

  if (!isOpen) return null;

  const categories: Array<{ key: 'all' | ScriptCategory; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'followup', label: 'Follow-up' },
    { key: 'intro', label: 'Apresentação' },
    { key: 'objection', label: 'Objeções' },
    { key: 'closing', label: 'Fechamento' },
    { key: 'rescue', label: 'Resgate' },
    { key: 'other', label: 'Outros' },
  ];

  return (
    <div
      className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(33,0,50,.55)' }}
        onClick={onClose}
      />
      <div
        className="panel relative w-full max-w-3xl mx-4"
        style={{ boxShadow: 'var(--shadow-lg)', maxHeight: '86vh', overflow: 'auto' }}
      >
        <div className="panel__head">
          <div style={{ minWidth: 0 }}>
            <h3 className="panel__title title-sm">{title}</h3>
            <p className="meta">
              Escolha um script salvo — as variáveis do deal/contato já entram preenchidas.
            </p>
          </div>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost" aria-label="Fechar" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="panel__body">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="buscar por título ou texto…"
            aria-label="Buscar template"
          />

          <p className="chip-row">
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={category === c.key ? 'chip chip--active' : 'chip'}
              >
                {c.label}
              </button>
            ))}
          </p>

          <p className="meta">
            Variáveis: <span className="code">{'{nome}'}</span> <span className="code">{'{empresa}'}</span>{' '}
            <span className="code">{'{valor}'}</span> <span className="code">{'{produto}'}</span>
          </p>

          {isLoading ? (
            <p className="meta">carregando scripts…</p>
          ) : filtered.length === 0 ? (
            <p className="meta">Nenhum template encontrado.</p>
          ) : (
            <ul className="feed">
              {filtered.map((s) => {
                const info = getCategoryInfo(s.category);
                const preview = applyVariables(s.template, variables);
                return (
                  <li key={s.id} className="feed__item">
                    <button
                      type="button"
                      className="feed__body"
                      style={{ textAlign: 'left', background: 'none', border: 0, padding: 0 }}
                      onClick={() => onPick(s)}
                    >
                      <span className="chip-row">
                        <span className={scriptCategoryChipClass(info.color)}>{info.label}</span>
                        <span className="feed__text" style={{ fontWeight: 700 }}>
                          {s.title}
                        </span>
                        {s.is_system ? <span className="tag">sistema</span> : null}
                      </span>
                      <span
                        className="feed__meta"
                        style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 4 }}
                      >
                        {preview}
                      </span>
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => onPick(s)}>
                      usar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Redesign 2026-08: categorias de script viram `.tag`/`.tag--ia`/`.tag--pink`
 * (o handoff não tem paleta de categoria, só estas 3 variações).
 */
function scriptCategoryChipClass(color: string): string {
  const c = (color ?? '').toLowerCase();
  if (c.includes('purple') || c.includes('violet') || c.includes('indigo')) return 'tag tag--ia';
  if (c.includes('pink') || c.includes('rose') || c.includes('red')) return 'tag tag--pink';
  return 'tag';
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function formatAtISO(iso: string): string {
  const d = new Date(iso);
  const dd = PT_BR_DATE_FORMATTER.format(d);
  const tt = PT_BR_TIME_FORMATTER.format(d);
  return `${dd} · ${tt}`;
}

function formatCurrencyBRL(value: number): string {
  try {
    return BRL_CURRENCY_FORMATTER.format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

function stageToneFromBoardColor(color?: string): StageTone {
  const c = (color ?? '').toLowerCase();
  if (c.includes('emerald') || c.includes('green')) return 'green';
  if (c.includes('violet') || c.includes('purple')) return 'violet';
  if (c.includes('amber') || c.includes('yellow') || c.includes('orange')) return 'amber';
  if (c.includes('blue') || c.includes('sky') || c.includes('cyan')) return 'blue';
  return 'slate';
}

/** Chip do redesign — `.tag` (neutro) com variações de sucesso/perigo. */
function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const style: React.CSSProperties =
    tone === 'success'
      ? { background: 'var(--success-soft)', borderColor: '#bfe6d1', color: '#1c7a4a' }
      : tone === 'danger'
        ? { background: 'var(--danger-soft)', borderColor: '#f3c2cd', color: '#a8203c' }
        : {};

  return (
    <span className="tag" style={style}>
      {children}
    </span>
  );
}

/** Bloco de coluna lateral do cockpit (`.cockpit__block` do handoff). */
function CockpitBlock({
  title,
  right,
  children,
  className,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Classe de ordem do empilhamento (`cockpit__sec--*`). Só layout: o cockpit
   * virou coluna única e a sequência dos blocos vive no CSS, não no JSX. */
  className?: string;
}) {
  return (
    <section className={className ? `cockpit__block ${className}` : 'cockpit__block'}>
      <div className="col-head__top">
        <h3 className="label" style={{ flex: 1 }}>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Painel do centro do cockpit (`.panel` do handoff). */
function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <div className="panel__head">
        <h3 className="panel__title title-sm">{title}</h3>
        <span className="spacer" />
        {right}
      </div>
      <div className={bodyClassName ?? 'panel__body'}>{children}</div>
    </section>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'composer__channel composer__channel--active' : 'composer__channel'}
    >
      {children}
    </button>
  );
}

function normalizeReason(raw?: string) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s*-\s*Sugerido por IA\s*$/i, '').trim();
}

function formatSlot(d: Date) {
  const day = d.toLocaleDateString('pt-BR', { weekday: 'short' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

function proposeTwoSlots() {
  const a = new Date();
  a.setDate(a.getDate() + 1);
  a.setHours(10, 0, 0, 0);

  const b = new Date();
  b.setDate(b.getDate() + 2);
  b.setHours(15, 0, 0, 0);

  return { a, b };
}

function buildSuggestedWhatsAppMessage(opts: {
  contact?: Contact;
  deal?: DealView;
  actionType: string;
  action: string;
  reason?: string;
}) {
  const { contact, deal, actionType, action, reason } = opts;

  const firstName = contact?.name?.split(' ')[0] || '';
  const greeting = firstName ? `Oi ${firstName}, tudo bem?` : 'Oi, tudo bem?';
  const r = normalizeReason(reason);
  const dealTitle = deal?.title?.trim();
  const dealCtx = dealTitle ? ` sobre ${dealTitle}` : '';

  const { a, b } = proposeTwoSlots();
  const reasonSentence = r ? `\n\nPensei nisso porque ${r.charAt(0).toLowerCase()}${r.slice(1)}.` : '';

  if (actionType === 'MEETING') {
    return (
      `${greeting}` +
      `\n\nQueria marcar um papo rápido (15 min)${dealCtx} pra alinharmos os próximos passos.` +
      `${reasonSentence}` +
      `\n\nVocê consegue ${formatSlot(a)} ou ${formatSlot(b)}? Se preferir, me diga um horário bom pra você.`
    );
  }

  if (actionType === 'CALL') {
    return (
      `${greeting}` +
      `\n\nPodemos fazer uma ligação rapidinha${dealCtx}?` +
      `${reasonSentence}` +
      `\n\nVocê prefere ${formatSlot(a)} ou ${formatSlot(b)}?`
    );
  }

  if (actionType === 'TASK') {
    return (
      `${greeting}` +
      `\n\nSó pra alinharmos${dealCtx}: ${action.trim()}.` +
      `${reasonSentence}` +
      `\n\nPode me confirmar quando conseguir?`
    );
  }

  const cleanAction = action?.trim();
  const actionLine = cleanAction ? `\n\n${cleanAction}${dealTitle ? ` (${dealTitle})` : ''}.` : '';
  return `${greeting}${actionLine}${reasonSentence}`;
}

function buildSuggestedEmailBody(opts: {
  contact?: Contact;
  deal?: DealView;
  actionType: string;
  action: string;
  reason?: string;
}) {
  const { contact, deal, actionType, action, reason } = opts;

  const firstName = contact?.name?.split(' ')[0] || '';
  const greeting = firstName ? `Olá ${firstName},` : 'Olá,';
  const r = normalizeReason(reason);
  const dealTitle = deal?.title?.trim();
  const { a, b } = proposeTwoSlots();

  const reasonSentence = r ? `\n\nMotivo: ${r}.` : '';
  const dealSentence = dealTitle ? `\n\nAssunto: ${dealTitle}.` : '';

  if (actionType === 'MEETING') {
    return (
      `${greeting}` +
      `\n\nQueria marcar uma conversa rápida (15 min) para alinharmos próximos passos.` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nVocê teria disponibilidade em ${formatSlot(a)} ou ${formatSlot(b)}?` +
      `\n\nAbs,`
    );
  }

  if (actionType === 'CALL') {
    return (
      `${greeting}` +
      `\n\nPodemos falar rapidamente por telefone?` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nSugestões de horário: ${formatSlot(a)} ou ${formatSlot(b)}.` +
      `\n\nAbs,`
    );
  }

  if (actionType === 'TASK') {
    return (
      `${greeting}` +
      `\n\n${action.trim()}.` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nAbs,`
    );
  }

  return (
    `${greeting}` +
    `\n\n${action.trim()}.` +
    `${dealSentence}` +
    `${reasonSentence}` +
    `\n\nAbs,`
  );
}

/**
 * Componente React `DealCockpitClient`.
 *
 * @param {{ dealId?: string | undefined; }} { dealId } - Parâmetro `{ dealId }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function DealCockpitClient({ dealId }: { dealId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Voltar contextual: o rótulo e o destino saem do `?from=` da própria URL.
  // Ver lib/navigation/origem.ts.
  const origem = useMemo(
    () => resolverOrigem(searchParams?.get('from'), searchParams?.get('fromId')),
    [searchParams]
  );

  const { profile, user } = useAuth();

  const { data: deals = [], isLoading: crmLoading, error: crmErrorRaw, refetch: refreshCRM } = useDealsView();
  const crmError = crmErrorRaw ? (crmErrorRaw instanceof Error ? crmErrorRaw.message : String(crmErrorRaw)) : null;
  const { data: contacts = [] } = useContacts();
  const { data: boards = [] } = useBoards();
  const { data: activities = [] } = useActivities();
  const createActivityMut = useCreateActivity();
  const updateDealMut = useUpdateDealMut();
  const addActivity = useCallback((activity: Omit<import('@/types').Activity, 'id' | 'createdAt'>) => createActivityMut.mutateAsync({ activity }), [createActivityMut]);
  const updateDeal = useCallback((id: string, updates: Partial<import('@/types').Deal>) => updateDealMut.mutateAsync({ id, updates }), [updateDealMut]);

  const [tab, setTab] = useState<Tab>('chat');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | TimelineItem['kind']>('all');
  const [showSystemEvents, setShowSystemEvents] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  const [noteDraftTimeline, setNoteDraftTimeline] = useState('');
  const [dealNoteDraft, setDealNoteDraft] = useState('');

  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callSuggestedTitle, setCallSuggestedTitle] = useState('Ligação');

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageChannel, setMessageChannel] = useState<MessageChannel>('WHATSAPP');
  const [messagePrefill, setMessagePrefill] = useState<{ subject?: string; message?: string } | null>(null);
  const [messageLogContext, setMessageLogContext] = useState<MessageLogContext | null>(null);
  const [messageLogDedupe, setMessageLogDedupe] = useState<{ key: string; at: number } | null>(null);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleInitial, setScheduleInitial] = useState<{
    type?: ScheduleType;
    title?: string;
    description?: string;
  } | null>(null);

  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [templatePickerMode, setTemplatePickerMode] = useState<TemplatePickerMode>('WHATSAPP');

  const defaultChecklist: ChecklistItem[] = useMemo(
    () => [
      { id: 'qualify', text: 'Qualificar (dor, urgência, orçamento, decisor)', done: false },
      { id: 'next-step', text: 'Definir próximo passo (data + responsável)', done: false },
      { id: 'materials', text: 'Enviar material / proposta', done: false },
      { id: 'stakeholders', text: 'Mapear decisores e objeções', done: false },
    ],
    []
  );

  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist);
  const [checklistDraft, setChecklistDraft] = useState('');

  const actor = useMemo(() => {
    const name =
      profile?.nickname?.trim() ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
      user?.email?.split('@')[0] ||
      'Usuário';

    return {
      name,
      avatar: profile?.avatar_url ?? '',
    };
  }, [profile?.avatar_url, profile?.first_name, profile?.last_name, profile?.nickname, user?.email]);

  // Performance: build lookup maps once (avoid repeated `.find(...)` in memos).
  const dealsById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const boardsById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);

  /**
   * Performance: group & sort activities by dealId once.
   * Avoid filter+sort per selectedDeal change.
   */
  const activitiesByDealIdSorted = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities ?? []) {
      if (!a.dealId) continue;
      const list = map.get(a.dealId);
      if (list) list.push(a);
      else map.set(a.dealId, [a]);
    }
    for (const [id, list] of map) {
      list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      map.set(id, list);
    }
    return map;
  }, [activities]);

  const selectedDeal = useMemo(() => {
    if (dealId) return dealsById.get(dealId) ?? null;
    return deals[0] ?? null;
  }, [deals, dealsById, dealId]);

  const sortedDeals = useMemo(() => {
    return (deals ?? []).slice().sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [deals]);

  const selectedContact = useMemo(() => {
    if (!selectedDeal) return null;
    return contactsById.get(selectedDeal.contactId) ?? null;
  }, [contactsById, selectedDeal]);

  const selectedBoard = useMemo(() => {
    if (!selectedDeal) return null;
    return boardsById.get(selectedDeal.boardId) ?? null;
  }, [boardsById, selectedDeal]);

  const templateVariables = useMemo(() => {
    const nome = selectedContact?.name?.split(' ')[0]?.trim() || 'Cliente';
    const empresa = selectedDeal?.clientCompanyName?.trim() || selectedDeal?.companyName?.trim() || 'Empresa';
    const valor = typeof selectedDeal?.value === 'number' ? formatCurrencyBRL(selectedDeal.value) : '';
    const produto = selectedDeal?.items?.[0]?.name?.trim() || selectedDeal?.title?.trim() || 'Produto';

    return {
      nome,
      empresa,
      valor,
      produto,
    };
  }, [
    selectedContact?.name,
    selectedDeal?.clientCompanyName,
    selectedDeal?.companyName,
    selectedDeal?.items,
    selectedDeal?.title,
    selectedDeal?.value,
  ]);

  const dealActivities = useMemo(() => {
    if (!selectedDeal) return [] as Activity[];
    return activitiesByDealIdSorted.get(selectedDeal.id) ?? [];
  }, [activitiesByDealIdSorted, selectedDeal]);

  const { moveDeal } = useMoveDealSimple(selectedBoard as Board | null, []);

  const stages: Stage[] = useMemo(() => {
    const ss: BoardStage[] = selectedBoard?.stages ?? [];
    return ss.map((s) => ({
      id: s.id,
      label: s.label,
      tone: stageToneFromBoardColor(s.color),
      rawColor: s.color,
    }));
  }, [selectedBoard]);

  const stageId = selectedDeal?.status ?? '';
  const stageSelection = useMemo(() => {
    if (!stages.length) return { stageIndex: 0, activeStage: undefined as Stage | undefined };
    let idx = 0;
    for (let i = 0; i < stages.length; i += 1) {
      if (stages[i]?.id === stageId) {
        idx = i;
        break;
      }
    }
    return { stageIndex: Math.max(0, idx), activeStage: stages[idx] ?? stages[0] };
  }, [stageId, stages]);
  const stageIndex = stageSelection.stageIndex;
  const activeStage = stageSelection.activeStage ?? stages[0];

  // Sem isto, um board com muitos estágios (a quantidade é dinâmica, por
  // board/org) abre com o estágio atual fora da área visível do `.stepper`
  // (max-height + overflow-y: auto) e a pessoa não vê onde o deal está sem
  // rolar às cegas. `block: 'nearest'` evita puxar a rolagem da PÁGINA quando
  // o passo já está visível. Issue #23, item 9.
  const stepperRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    stepperRef.current
      ?.querySelector('.stepper__step--current')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [stageIndex, selectedDeal?.id]);

  const { data: aiAnalysis, isLoading: aiLoading, refetch: refetchAI } = useAIDealAnalysis(
    selectedDeal,
    selectedDeal?.stageLabel
  );

  const health = useMemo(() => {
    // `aiAnalysis?.probabilityScore` vem `undefined` quando a IA falhou (ver
    // useAIDealAnalysis.ts) — nunca um número inventado. Cai pro probability
    // real do deal, que é dado do CRM, não análise fabricada. Issue #23, item 2.
    const probability = aiAnalysis?.probabilityScore ?? selectedDeal?.probability ?? 50;
    return deriveHealthFromProbability(probability);
  }, [aiAnalysis?.probabilityScore, selectedDeal?.probability]);

  /**
   * Três números que sustentam o nível de risco. Todos derivam de dado do CRM
   * que já está em memória — nada de estimativa: um número inventado ao lado da
   * palavra "alto" faz a pessoa confiar no diagnóstico pelo motivo errado.
   *
   * `null` quando não há de onde tirar (deal sem atividade nenhuma, por
   * exemplo) e a tela mostra "—", que é diferente de zero.
   */
  const riskStats = useMemo(() => {
    const agora = Date.now();
    const emDias = (iso?: string | null) => {
      if (!iso) return null;
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return null;
      return Math.max(0, Math.floor((agora - t) / 86_400_000));
    };
    let ultimaAtividade: string | null = null;
    for (const a of dealActivities ?? []) {
      if (!a.date) continue;
      if (!ultimaAtividade || new Date(a.date).getTime() > new Date(ultimaAtividade).getTime()) {
        ultimaAtividade = a.date;
      }
    }
    return {
      semResposta: emDias(ultimaAtividade ?? selectedDeal?.updatedAt),
      atividades: (dealActivities ?? []).length,
      noFunil: emDias(selectedDeal?.createdAt),
    };
  }, [dealActivities, selectedDeal?.createdAt, selectedDeal?.updatedAt]);

  /** Link da proposta já filtrado por esquema — ver o comentário no campo. */
  const linkDaProposta = useMemo(() => sanitizeUrl(selectedDeal?.proposalLink), [selectedDeal?.proposalLink]);

  /**
   * A barra de saúde mostra a estimativa da IA ou o campo do deal? A tela tem
   * que dizer qual, porque os dois números divergem e aparecem lado a lado.
   */
  const saudeVeioDaIA = aiAnalysis?.probabilityScore != null && !aiAnalysis.error;

  /** Nível de risco em uma palavra — usado pela cor do texto e pela barra. */
  const nivelRisco: 'baixo' | 'medio' | 'alto' =
    health.status === 'excellent' || health.status === 'good'
      ? 'baixo'
      : health.status === 'warning'
        ? 'medio'
        : 'alto';

  const nextBestAction = useMemo(() => {
    if (aiAnalysis?.action && !aiAnalysis.error) {
      return {
        action: aiAnalysis.action,
        reason: aiAnalysis.reason,
        urgency: aiAnalysis.urgency,
        actionType: aiAnalysis.actionType,
        isAI: true,
      };
    }

    // "Sem sugestão" e "sem serviço" são coisas diferentes e antes mostravam o
    // mesmo texto. Em 2026-09-01 a IA ficou fora do ar (modelo removido do
    // catálogo da OpenRouter) e a tela dizia calmamente que não havia sugestão —
    // a operadora agiu achando que o deal não tinha nada a sugerir, quando na
    // verdade não havia IA nenhuma. Ver issue #16.
    //
    // "IA fora do ar" também não pode virar o texto padrão pra QUALQUER erro:
    // 403 AI_FEATURE_DISABLED (org desligou de propósito) e 401 UNAUTHORIZED
    // (sessão expirada) não são queda — dizer isso reporta um incidente que
    // não existe e queima a credibilidade do aviso na próxima queda real.
    // `describeAIError` diferencia pelo `errorCode`. Issue #23, item 2.
    return {
      action: 'Analisar deal manualmente',
      reason: aiAnalysis?.error
        ? describeAIError(aiAnalysis.errorCode)
        : 'Sem sugestão da IA no momento',
      urgency: 'low' as const,
      actionType: 'TASK' as const,
      isAI: false,
    };
  }, [aiAnalysis]);

  const { notes, isLoading: isNotesLoading, createNote, deleteNote } = useDealNotes(selectedDeal?.id);
  const { files, isLoading: isFilesLoading, uploadFile, deleteFile, downloadFile, formatFileSize } = useDealFiles(selectedDeal?.id);
  const { scripts, isLoading: isScriptsLoading, applyVariables, getCategoryInfo } = useQuickScripts();

  const cockpitSnapshot = useMemo(() => {
    if (!selectedDeal) return null;

    const stageInfo = activeStage
      ? { id: activeStage.id, label: activeStage.label, color: activeStage.rawColor ?? '' }
      : undefined;

    const boardInfo = selectedBoard
      ? {
          id: selectedBoard.id,
          name: selectedBoard.name,
          description: selectedBoard.description,
          wonStageId: selectedBoard.wonStageId,
          lostStageId: selectedBoard.lostStageId,
          stages: (selectedBoard.stages ?? []).map((s) => ({ id: s.id, label: s.label, color: s.color })),
        }
      : undefined;

    const contactInfo = selectedContact
      ? {
          id: selectedContact.id,
          name: selectedContact.name,
          role: selectedContact.role,
          email: selectedContact.email,
          phone: selectedContact.phone,
          avatar: selectedContact.avatar,
          status: selectedContact.status,
          stage: selectedContact.stage,
          source: selectedContact.source,
          notes: selectedContact.notes,
          lastInteraction: selectedContact.lastInteraction,
          birthDate: selectedContact.birthDate,
          lastPurchaseDate: selectedContact.lastPurchaseDate,
          totalValue: selectedContact.totalValue,
          clientCompanyId: selectedContact.clientCompanyId,
        }
      : undefined;

    const dealInfo = {
      id: selectedDeal.id,
      title: selectedDeal.title,
      value: selectedDeal.value,
      status: selectedDeal.status,
      isWon: selectedDeal.isWon,
      isLost: selectedDeal.isLost,
      probability: selectedDeal.probability,
      priority: selectedDeal.priority,
      owner: selectedDeal.owner,
      ownerId: selectedDeal.ownerId,
      nextActivity: selectedDeal.nextActivity,
      tags: selectedDeal.tags,
      items: selectedDeal.items,
      customFields: selectedDeal.customFields,
      lastStageChangeDate: selectedDeal.lastStageChangeDate,
      lossReason: selectedDeal.lossReason,
      createdAt: selectedDeal.createdAt,
      updatedAt: selectedDeal.updatedAt,
      companyId: selectedDeal.companyId,
      clientCompanyId: selectedDeal.clientCompanyId,
      companyName: selectedDeal.companyName,
      clientCompanyName: selectedDeal.clientCompanyName,
      stageLabel: selectedDeal.stageLabel,
    };

    const activitiesLimit = 25;
    const activitiesPreview = (dealActivities ?? []).slice(0, activitiesLimit).map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      description: a.description,
      date: a.date,
      completed: a.completed,
      user: a.user?.name,
    }));

    const notesLimit = 50;
    const notesPreview = (notes ?? []).slice(0, notesLimit).map((n) => ({
      id: n.id,
      content: n.content,
      created_at: n.created_at,
      updated_at: n.updated_at,
      created_by: n.created_by,
    }));

    const filesLimit = 50;
    const filesPreview = (files ?? []).slice(0, filesLimit).map((f) => ({
      id: f.id,
      file_name: f.file_name,
      file_size: f.file_size,
      mime_type: f.mime_type,
      file_path: f.file_path,
      created_at: f.created_at,
      created_by: f.created_by,
    }));

    const scriptsLimit = 50;
    const scriptsPreview = (scripts ?? []).slice(0, scriptsLimit).map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category,
      template: s.template,
      icon: s.icon,
      is_system: s.is_system,
      updated_at: s.updated_at,
    }));

    return {
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'deal-cockpit',
        version: 1,
      },
      deal: dealInfo,
      contact: contactInfo,
      board: boardInfo,
      stage: stageInfo,
      cockpitSignals: {
        nextBestAction,
        aiAnalysis: aiAnalysis ?? null,
        aiAnalysisLoading: aiLoading,
      },
      lists: {
        activities: {
          total: (dealActivities ?? []).length,
          preview: activitiesPreview,
          limit: activitiesLimit,
          truncated: (dealActivities ?? []).length > activitiesLimit,
        },
        notes: {
          total: (notes ?? []).length,
          preview: notesPreview,
          loading: isNotesLoading,
          limit: notesLimit,
          truncated: (notes ?? []).length > notesLimit,
        },
        files: {
          total: (files ?? []).length,
          preview: filesPreview,
          loading: isFilesLoading,
          limit: filesLimit,
          truncated: (files ?? []).length > filesLimit,
        },
        scripts: {
          total: (scripts ?? []).length,
          preview: scriptsPreview,
          loading: isScriptsLoading,
          limit: scriptsLimit,
          truncated: (scripts ?? []).length > scriptsLimit,
        },
      },
    };
  }, [
    selectedDeal,
    selectedContact,
    selectedBoard,
    activeStage,
    dealActivities,
    notes,
    files,
    scripts,
    nextBestAction,
    aiAnalysis,
    aiLoading,
    isNotesLoading,
    isFilesLoading,
    isScriptsLoading,
  ]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    for (const a of dealActivities) {
      const kind: TimelineItem['kind'] = a.type === 'CALL' ? 'call' : a.type === 'STATUS_CHANGE' ? 'status' : 'note';

      const tone: TimelineItem['tone'] =
        a.type === 'STATUS_CHANGE'
          ? `${a.title ?? ''} ${a.description ?? ''}`.toLowerCase().includes('ganh')
            ? 'success'
            : `${a.title ?? ''} ${a.description ?? ''}`.toLowerCase().includes('perd')
              ? 'danger'
              : 'neutral'
          : undefined;

      const subtitle = a.description?.trim() ? a.description.trim() : undefined;

      items.push({
        id: a.id,
        at: formatAtISO(a.date),
        kind,
        title: a.title || a.type,
        subtitle,
        tone,
      });
    }

    return items;
  }, [dealActivities]);

  const filteredTimelineItems = useMemo(() => {
    return timelineItems.filter((t) => {
      if (!showSystemEvents && t.kind === 'system') return false;
      if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return `${t.title} ${t.subtitle ?? ''}`.toLowerCase().includes(q);
    });
  }, [kindFilter, query, showSystemEvents, timelineItems]);

  const latestNonSystem = useMemo(() => timelineItems.find((t) => t.kind !== 'system') ?? null, [timelineItems]);
  const latestCall = useMemo(() => timelineItems.find((t) => t.kind === 'call') ?? null, [timelineItems]);
  const latestMove = useMemo(() => timelineItems.find((t) => t.kind === 'status') ?? null, [timelineItems]);

  const pushToast = useCallback((message: string, tone: ToastTone = 'neutral') => {
    const id = uid('toast');
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 2400);
  }, []);

  const copyToClipboard = useCallback(
    async (label: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        pushToast(`${label} copiado`, 'success');
      } catch {
        pushToast(`Não foi possível copiar ${label.toLowerCase()}`, 'danger');
      }
    },
    [pushToast]
  );

  const openMessageComposer = useCallback(
    (channel: MessageChannel, prefill?: { subject?: string; message?: string }, ctx?: MessageLogContext | null) => {
      setMessageChannel(channel);
      setMessagePrefill(prefill ?? null);
      setMessageLogContext(ctx ?? null);
      setIsMessageModalOpen(true);
    },
    []
  );

  const openScheduleModal = useCallback((initial?: { type?: ScheduleType; title?: string; description?: string }) => {
    setScheduleInitial(initial ?? null);
    setIsScheduleModalOpen(true);
  }, []);

  const openTemplatePicker = useCallback((mode: TemplatePickerMode) => {
    setTemplatePickerMode(mode);
    setIsTemplatePickerOpen(true);
  }, []);

  const handlePickTemplate = useCallback(
    (script: QuickScript) => {
      if (!selectedDeal) return;

      const applied = applyVariables(script.template, templateVariables);

      if (templatePickerMode === 'WHATSAPP') {
        openMessageComposer(
          'WHATSAPP',
          { message: applied },
          {
            source: 'template',
            origin: 'nextBestAction',
            template: { id: script.id, title: script.title },
            aiSuggested: nextBestAction.isAI,
            aiActionType: nextBestAction.actionType,
          }
        );
        setIsTemplatePickerOpen(false);
        return;
      }

      const fallbackSubject = `Sobre ${selectedDeal.title}`;
      const { subject, body } = pickEmailPrefill(applied, fallbackSubject);
      openMessageComposer(
        'EMAIL',
        { subject, message: body },
        {
          source: 'template',
          origin: 'nextBestAction',
          template: { id: script.id, title: script.title },
          aiSuggested: nextBestAction.isAI,
          aiActionType: nextBestAction.actionType,
        }
      );
      setIsTemplatePickerOpen(false);
    },
    [
      applyVariables,
      nextBestAction.actionType,
      nextBestAction.isAI,
      openMessageComposer,
      selectedDeal,
      templatePickerMode,
      templateVariables,
    ]
  );

  const setDealInUrl = useCallback(
    (nextDealId: string) => {
      // Rota V2: /deals/[dealId]/cockpit-v2
      if (pathname?.includes('/deals/') && pathname.endsWith('/cockpit-v2')) {
        if (!nextDealId) return;
        // Carrega `from`/`fromId` pra frente: sem isto, trocar de deal pelo
        // seletor apaga a origem e o voltar contextual degrada pro padrão
        // `/boards` sem nada mudar de aparência.
        const query = searchParams?.toString();
        router.replace(`/deals/${nextDealId}/cockpit-v2${query ? `?${query}` : ''}`);
        return;
      }

      // Compat (ponte): /labs/deal-cockpit-mock?dealId=...
      const sp = new URLSearchParams(searchParams?.toString());
      if (nextDealId) sp.set('dealId', nextDealId);
      else sp.delete('dealId');
      router.replace(`?${sp.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const normalizeChecklist = useCallback(
    (raw: unknown): ChecklistItem[] | null => {
      if (!Array.isArray(raw)) return null;
      const items: ChecklistItem[] = [];
      for (const it of raw) {
        if (!it || typeof it !== 'object') continue;
        const anyIt = it as any;
        const id = typeof anyIt.id === 'string' && anyIt.id ? anyIt.id : uid('chk');
        const text = typeof anyIt.text === 'string' ? anyIt.text.trim() : '';
        const done = Boolean(anyIt.done);
        if (!text) continue;
        items.push({ id, text, done });
      }
      return items.length ? items : [];
    },
    []
  );

  const loadChecklistFromDeal = useCallback(() => {
    const raw = (selectedDeal?.customFields as any)?.cockpitChecklist;
    const parsed = normalizeChecklist(raw);
    setChecklist(parsed ?? defaultChecklist);
    setChecklistDraft('');
  }, [defaultChecklist, normalizeChecklist, selectedDeal?.customFields]);

  useEffect(() => {
    loadChecklistFromDeal();
  }, [loadChecklistFromDeal, selectedDeal?.id]);

  const persistChecklist = useCallback(
    async (next: ChecklistItem[]) => {
      if (!selectedDeal) return;
      setChecklist(next);

      const nextCustomFields = {
        ...(selectedDeal.customFields ?? {}),
        cockpitChecklist: next,
      };
      try {
        await updateDeal(selectedDeal.id, { customFields: nextCustomFields });
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível salvar o checklist.'), 'danger');
      }
    },
    [pushToast, selectedDeal, updateDeal]
  );

  const handleMessageExecuted = useCallback(
    async (ev: MessageExecutedEvent) => {
      if (!selectedDeal) return;

      const payloadKey = `${ev.channel}|${ev.subject ?? ''}|${ev.message ?? ''}`;
      const nextKey = hashString(payloadKey);
      const now = Date.now();

      // Dedupe best-effort (duplo clique / evento repetido)
      if (messageLogDedupe && messageLogDedupe.key === nextKey && now - messageLogDedupe.at < 1500) {
        return;
      }
      setMessageLogDedupe({ key: nextKey, at: now });

      const header = buildExecutionHeader({
        channel: ev.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL',
        context: messageLogContext,
      });

      if (ev.channel === 'WHATSAPP') {
        const msg = ev.message?.trim() ? ev.message.trim() : 'Mensagem enviada via WhatsApp.';
        try {
          await addActivity({
            dealId: selectedDeal.id,
            dealTitle: selectedDeal.title,
            type: 'NOTE',
            title: 'WhatsApp',
            description: `${header}\n\n---\n\n${msg}`,
            date: new Date().toISOString(),
            completed: true,
            user: actor,
          });
          pushToast('WhatsApp registrado', 'success');
          setMessageLogContext(null);
        } catch (e) {
          pushToast(errorMessage(e, 'Não foi possível registrar o WhatsApp.'), 'danger');
        }
        return;
      }

      const subject = ev.subject?.trim() ? ev.subject.trim() : 'Email';
      const body = ev.message?.trim() ? ev.message.trim() : 'Email enviado.';

      try {
        await addActivity({
          dealId: selectedDeal.id,
          dealTitle: selectedDeal.title,
          type: 'EMAIL',
          title: subject,
          description: `${header}\nAssunto: ${subject}\n\n---\n\n${body}`,
          date: new Date().toISOString(),
          completed: true,
          user: actor,
        });
        pushToast('Email registrado', 'success');
        setMessageLogContext(null);
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível registrar o email.'), 'danger');
      }
    },
    [addActivity, actor, messageLogContext, messageLogDedupe, pushToast, selectedDeal]
  );

  const handleScheduleSave = useCallback(
    async (data: ScheduleData) => {
      if (!selectedDeal) return;

      // data.date = YYYY-MM-DD, data.time = HH:mm
      const when = new Date(`${data.date}T${data.time}:00`);
      try {
        await addActivity({
          dealId: selectedDeal.id,
          dealTitle: selectedDeal.title,
          type: data.type,
          title: data.title,
          description: data.description,
          date: when.toISOString(),
          completed: false,
          user: actor,
        });
        pushToast('Atividade agendada', 'success');
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível agendar a atividade.'), 'danger');
      }
    },
    [addActivity, actor, pushToast, selectedDeal]
  );

  const [sendingWhatsappProposal, setSendingWhatsappProposal] = useState(false);

  const handleSendWhatsappProposal = useCallback(async () => {
    if (!selectedDeal?.proposalLink) {
      pushToast('Este negócio ainda não tem link de proposta', 'danger');
      return;
    }
    setSendingWhatsappProposal(true);
    try {
      const res = await fetch(`/api/deals/${selectedDeal.id}/send-whatsapp-proposal`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast(body.error || 'Falha ao enviar proposta via WhatsApp', 'danger');
        return;
      }
      pushToast('Proposta enviada via WhatsApp', 'success');
    } catch {
      pushToast('Falha ao enviar proposta via WhatsApp', 'danger');
    } finally {
      setSendingWhatsappProposal(false);
    }
  }, [selectedDeal?.id, selectedDeal?.proposalLink, pushToast]);

  const handleCall = useCallback(
    (suggestedTitle?: string) => {
      if (!selectedContact?.phone) {
        pushToast('Contato sem telefone', 'danger');
        return;
      }
      setCallSuggestedTitle(suggestedTitle || 'Ligação');
      setIsCallModalOpen(true);
    },
    [pushToast, selectedContact?.phone]
  );

  const handleCallLogSave = useCallback(
    async (data: CallLogData) => {
      if (!selectedDeal) return;

      const outcomeLabels = {
        connected: 'Atendeu',
        no_answer: 'Não atendeu',
        voicemail: 'Caixa postal',
        busy: 'Ocupado',
      };

      try {
        await addActivity({
          dealId: selectedDeal.id,
          dealTitle: selectedDeal.title,
          type: 'CALL',
          title: data.title,
          description: `${outcomeLabels[data.outcome]} - Duração: ${Math.floor(data.duration / 60)}min ${data.duration % 60}s${
            data.notes ? `\n\n${data.notes}` : ''
          }`,
          date: new Date().toISOString(),
          completed: true,
          user: actor,
        });

        pushToast('Ligação registrada', 'success');
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível registrar a ligação.'), 'danger');
      }
    },
    [addActivity, actor, pushToast, selectedDeal]
  );

  const handleExecuteNext = useCallback(async () => {
    if (!selectedDeal) return;

    const { action, reason, actionType } = nextBestAction;

    if (actionType === 'CALL') {
      handleCall(action);
      return;
    }

    if (actionType === 'WHATSAPP') {
      openMessageComposer(
        'WHATSAPP',
        {
          message: buildSuggestedWhatsAppMessage({
            contact: selectedContact ?? undefined,
            deal: selectedDeal,
            actionType: 'TASK',
            action,
            reason,
          }),
        },
        {
          source: 'generated',
          origin: 'nextBestAction',
          aiSuggested: nextBestAction.isAI,
          aiActionType: nextBestAction.actionType,
        }
      );
      return;
    }

    if (actionType === 'EMAIL') {
      openMessageComposer(
        'EMAIL',
        {
          subject: action,
          message: buildSuggestedEmailBody({
            contact: selectedContact ?? undefined,
            deal: selectedDeal,
            actionType: 'TASK',
            action,
            reason,
          }),
        },
        {
          source: 'generated',
          origin: 'nextBestAction',
          aiSuggested: nextBestAction.isAI,
          aiActionType: nextBestAction.actionType,
        }
      );
      return;
    }

    // MEETING/TASK: agenda (modal real)
    if (actionType === 'MEETING') {
      openScheduleModal({
        type: 'MEETING',
        title: action,
        description: `${reason} - Sugerido por IA`,
      });
      return;
    }

    openScheduleModal({
      type: 'TASK',
      title: action,
      description: `${reason} - Sugerido por IA`,
    });
  }, [handleCall, nextBestAction, openMessageComposer, openScheduleModal, selectedContact, selectedDeal]);

  const handleStageChange = useCallback(
    async (nextStageId: string) => {
      if (!selectedDeal) return;
      if (!selectedBoard) return;
      if (nextStageId === selectedDeal.status) return;

      try {
        await moveDeal(selectedDeal, nextStageId);
        const next = selectedBoard.stages.find((s) => s.id === nextStageId);
        pushToast(`Etapa: ${next?.label ?? 'Atualizada'}`, 'success');

        // Log na timeline (best-effort)
        try {
          await addActivity({
            dealId: selectedDeal.id,
            dealTitle: selectedDeal.title,
            type: 'STATUS_CHANGE',
            title: 'Moveu para',
            description: next?.label ?? 'Etapa atualizada',
            date: new Date().toISOString(),
            completed: true,
            user: actor,
          });
        } catch {
          // Não bloqueia o fluxo principal
          pushToast('Etapa atualizada (sem log)', 'neutral');
        }
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível mover etapa.'), 'danger');
      }
    },
    [addActivity, actor, moveDeal, pushToast, selectedBoard, selectedDeal]
  );

  if (crmError) {
    return (
      <div className="screen__inner screen__inner--narrow">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title title-md">cockpit do deal</h2>
            <span className="spacer" />
            <p className="meta">/deals/[dealId]/cockpit-v2</p>
          </div>
          <div className="panel__body">
            <p className="banner banner--error">
              <span className="dot" />
              <span>
                <span className="banner__title">não foi possível carregar os dados do CRM</span>
                <span className="banner__text wrap-break-word"> {crmError}</span>
              </span>
            </p>
            <p className="state-empty__actions">
              <button type="button" className="btn btn--primary" onClick={() => void refreshCRM()}>
                recarregar
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => router.push('/boards')}>
                ir para negociação
              </button>
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (crmLoading && (!deals || deals.length === 0)) {
    return (
      <div className="screen__inner screen__inner--narrow">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title title-md">cockpit do deal</h2>
            <span className="spacer" />
            <p className="meta">carregando…</p>
          </div>
          <div className="skeleton-stack">
            <div className="skeleton skeleton--text" />
            <div className="skeleton skeleton--card" />
            <div className="skeleton skeleton--card" />
          </div>
          <p className="meta" style={{ marginTop: 'var(--space-3)' }}>
            buscando deals, boards e atividades do seu workspace…
          </p>
        </section>
      </div>
    );
  }

  if (!selectedDeal || !selectedBoard) {
    return (
      <div className="screen__inner screen__inner--narrow">
        <div className="state-empty state-empty--boxed">
          <p className="eyebrow">cockpit do deal</p>
          <h2 className="state-empty__title">nenhum deal carregado</h2>
          <p className="state-empty__text">
            Abra a Negociação para carregar os dados. Com deals carregados, dá pra trocar por aqui
            mesmo no seletor do topo.
          </p>
          <p className="state-empty__actions">
            <button type="button" className="btn btn--primary" onClick={() => void refreshCRM()}>
              recarregar
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => router.push('/boards')}>
              ir para negociação
            </button>
          </p>
        </div>
      </div>
    );
  }

  const deal = selectedDeal;
  const board = selectedBoard;
  const contact = selectedContact;

  const companyName = deal.clientCompanyName || deal.companyName || 'Empresa';

  const phoneE164 = normalizePhoneE164(contact?.phone);

  const stageGroups = buildStageGroupMap(board.stages ?? [], board);
  const currentGroup = deal.isLost
    ? 'perdido'
    : deal.isWon
      ? 'ganho'
      : (stageGroups.get(deal.status) ?? 'frio');
  const nextStage = stages[stageIndex + 1] ?? null;

  return (
    <div className="cockpit">
      {toast ? (
        <p
          className={
            toast.tone === 'danger'
              ? 'banner banner--error banner--realtime'
              : 'banner banner--realtime'
          }
          role="status"
          aria-live="polite"
        >
          <span className="dot" />
          <span className="banner__text">{toast.message}</span>
        </p>
      ) : null}

      <header className="cockpit__head">
        <div className="cockpit__head-top">
          <button
            type="button"
            className="back-link"
            onClick={() => router.push(origem.href)}
            title={origem.label}
          >
            {origem.label}
          </button>
          <h2 className="cockpit__title" title={humanizeTestLabel(deal.title) || deal.title}>{humanizeTestLabel(deal.title) || deal.title}</h2>
          <p className="cockpit__value num">{formatCurrencyBRL(deal.value ?? 0)}</p>
          <span className={`badge-stage badge-stage--${currentGroup}`}>
            {activeStage?.label ?? '—'}
          </span>
          <span className="badge-origin badge-origin--humano">
            <span className="badge-origin__icon" aria-hidden="true">
              ●
            </span>
            {latestMove ? `movido · ${latestMove.at}` : formatAtISO(deal.updatedAt)}
          </span>

          <select
            className="input"
            // 260px era o segundo maior item da linha do cabeçalho e ajudava a
            // empurrar tudo pra uma 2ª linha (48px de altura a menos pro corpo).
            // 180px ainda mostra o nome do deal; o resto o próprio select trunca.
            style={{ width: 'auto', maxWidth: 180, padding: '6px 10px' }}
            value={deal.id}
            onChange={(e) => setDealInUrl(e.target.value)}
            aria-label="Selecionar deal"
            title={`${humanizeTestLabel(deal.title) || deal.title} — ${companyName}`}
          >
            {sortedDeals.map((d) => {
              const labelCompany = d.clientCompanyName || d.companyName || 'Empresa';
              return (
                <option key={d.id} value={d.id}>
                  {humanizeTestLabel(d.title) || d.title} — {labelCompany}
                </option>
              );
            })}
          </select>

          <span className="spacer" />

          {crmLoading ? <span className="meta">sincronizando…</span> : null}

          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              openScheduleModal({
                type: 'TASK',
                title: 'Registrar atividade',
                description: 'Criado no cockpit.',
              })
            }
          >
            registrar atividade
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!nextStage}
            onClick={() => nextStage && void handleStageChange(nextStage.id)}
            title={nextStage ? `Mover para ${nextStage.label}` : 'Já está no último estágio'}
          >
            avançar estágio
          </button>
        </div>

        <ol className="stepper" ref={stepperRef}>
          {stages.map((s, idx) => (
            <li key={s.id} style={{ display: 'contents' }}>
              <button
                type="button"
                className={`stepper__step${
                  idx === stageIndex
                    ? ' stepper__step--current'
                    : idx < stageIndex
                      ? ' stepper__step--done'
                      : ''
                }`}
                aria-current={idx === stageIndex ? 'step' : undefined}
                onClick={() => void handleStageChange(s.id)}
                title={`Mover para ${s.label}`}
              >
                <span className="stepper__n">{idx + 1}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </header>

      <div className="cockpit__body">
        {/* Os três containers abaixo são `display: contents`: não desenham nada, só
            agrupam. A ordem na tela vem das classes `cockpit__sec--*` de cada
            bloco (ver app/globals.css), não da posição aqui no JSX. */}
        {/* ------- contêiner 1 (era a coluna esquerda) ------- */}
        <aside className="cockpit__aside">
          <CockpitBlock title="contato principal" className="cockpit__sec--contato">
            <div className="contact-head">
              <span className="avatar avatar--purple avatar--md" aria-hidden="true">
                {getInitials(contact?.name ?? deal.title)}
              </span>
              <div style={{ minWidth: 0 }}>
                <p className="contact-head__name">
                  {humanizeTestLabel(contact?.name) || contact?.name || '—'}
                </p>
                <p className="contact-head__role">{contact?.role || companyName}</p>
              </div>
              <span className="spacer" />
              {contact?.id ? (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => router.push(`/contacts/${contact.id}?from=deal&fromId=${deal.id}`)}
                >
                  ver contato completo
                </button>
              ) : null}
            </div>
            <div className="channel-actions">
              <button
                type="button"
                className="channel-actions__btn"
                onClick={() =>
                  openMessageComposer(
                    'WHATSAPP',
                    {
                      message: buildSuggestedWhatsAppMessage({
                        contact: contact ?? undefined,
                        deal,
                        actionType: nextBestAction.actionType,
                        action: nextBestAction.action,
                        reason: nextBestAction.reason,
                      }),
                    },
                    {
                      source: 'generated',
                      origin: 'nextBestAction',
                      aiSuggested: nextBestAction.isAI,
                      aiActionType: nextBestAction.actionType,
                    }
                  )
                }
              >
                <span
                  className="badge-channel badge-channel--whatsapp badge-channel--sm"
                  aria-hidden="true"
                >
                  W
                </span>
                WhatsApp
              </button>
              <button
                type="button"
                className="channel-actions__btn"
                onClick={() =>
                  openMessageComposer(
                    'EMAIL',
                    {
                      subject: `Sobre ${deal.title}`,
                      message: buildSuggestedEmailBody({
                        contact: contact ?? undefined,
                        deal,
                        actionType: nextBestAction.actionType,
                        action: nextBestAction.action,
                        reason: nextBestAction.reason,
                      }),
                    },
                    {
                      source: 'generated',
                      origin: 'nextBestAction',
                      aiSuggested: nextBestAction.isAI,
                      aiActionType: nextBestAction.actionType,
                    }
                  )
                }
              >
                <span
                  className="badge-channel badge-channel--email badge-channel--sm"
                  aria-hidden="true"
                >
                  E
                </span>
                e-mail
              </button>
              <button
                type="button"
                className="channel-actions__btn"
                onClick={() => handleCall('Ligação')}
                title="Registrar ligação"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                ligar
              </button>
              <button
                type="button"
                className="channel-actions__btn"
                onClick={handleSendWhatsappProposal}
                disabled={!deal.proposalLink || sendingWhatsappProposal}
                title={deal.proposalLink ? 'Enviar link da proposta via WhatsApp' : 'Sem link de proposta ainda'}
              >
                <span
                  className="badge-channel badge-channel--whatsapp badge-channel--sm"
                  aria-hidden="true"
                >
                  W
                </span>
                {sendingWhatsappProposal ? 'enviando...' : 'enviar proposta'}
              </button>
            </div>
            {/* Grade de campos: os dados do contato E os do deal na mesma
                seção. Antes eram dois blocos (`contato principal` e `dados do
                deal`) com `.data-list` — rótulo à esquerda, valor à direita.
                Em coluna única de 900px aquilo abria um vão de ~700px no meio
                de cada linha e obrigava o olho a atravessar a tela por campo.
                `.field-grid` põe rótulo e valor juntos e reflui sozinha. */}
            <dl className="field-grid section-card__split">
              <div className="field">
                <dt className="field__label">WhatsApp</dt>
                <dd className="field__value">
                  <span className="num">{phoneE164 ?? '—'}</span>
                  {phoneE164 ? (
                    <button
                      type="button"
                      className="btn btn--quiet"
                      style={{ padding: '0 0 0 6px' }}
                      title="Copiar telefone"
                      onClick={() => void copyToClipboard('Telefone', phoneE164)}
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </dd>
              </div>
              <div className="field">
                <dt className="field__label">e-mail</dt>
                <dd className="field__value">
                  {contact?.email || '—'}
                  {contact?.email ? (
                    <button
                      type="button"
                      className="btn btn--quiet"
                      style={{ padding: '0 0 0 6px' }}
                      title="Copiar e-mail"
                      onClick={() => void copyToClipboard('Email', contact.email)}
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </dd>
              </div>
              <div className="field">
                <dt className="field__label">empresa</dt>
                <dd className="field__value">{companyName}</dd>
              </div>
              <div className="field">
                <dt className="field__label">board</dt>
                <dd className="field__value">{board.name ?? 'Pipeline'}</dd>
              </div>
              <div className="field">
                <dt className="field__label">valor</dt>
                <dd className="field__value num">{formatCurrencyBRL(deal.value ?? 0)}</dd>
              </div>
              <div className="field">
                <dt className="field__label">origem</dt>
                <dd className="field__value">{contact?.source ?? '—'}</dd>
              </div>
              <div className="field">
                <dt className="field__label">dono</dt>
                <dd className="field__value">{deal.owner?.name ?? '—'}</dd>
              </div>
              <div className="field">
                <dt className="field__label">probabilidade</dt>
                <dd className="field__value num">{deal.probability ?? 50}%</dd>
              </div>
              <div className="field">
                <dt className="field__label">última mudança</dt>
                <dd className="field__value">
                  {latestMove ? latestMove.at : formatAtISO(deal.updatedAt)}
                </dd>
              </div>
              {/* `deals.proposal_link` chega de OUTRO sistema: o webhook-in grava
                  `payload.link_publico` sem checar esquema
                  (supabase/functions/webhook-in/index.ts:252). Este é o primeiro
                  ponto que transforma esse valor em `href` — sem o filtro, um
                  `javascript:` ali executa no clique. `sanitizeUrl` devolve ''
                  pra esquema fora da lista, e aí o campo simplesmente não
                  aparece. Ver CLAUDE.md, "Sanitize". */}
              {linkDaProposta ? (
                <div className="field">
                  <dt className="field__label">proposta</dt>
                  <dd className="field__value field__value--link">
                    <a href={linkDaProposta} target="_blank" rel="noreferrer">
                      abrir proposta
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </CockpitBlock>

          <CockpitBlock title="sinais" className="cockpit__sec--ref">
            <dl className="data-list">
              <div className="data-list__row">
                <dt>último evento</dt>
                <dd style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {latestNonSystem
                    ? `${latestNonSystem.title}${latestNonSystem.subtitle ? ` — ${latestNonSystem.subtitle}` : ''}`
                    : '—'}
                </dd>
              </div>
              <div className="data-list__row">
                <dt>última ligação</dt>
                <dd>{latestCall ? latestCall.at : '—'}</dd>
              </div>
              <div className="data-list__row">
                <dt>status do contato</dt>
                <dd>{contact?.status ?? '—'}</dd>
              </div>
            </dl>
          </CockpitBlock>

          {deal.tags?.length ? (
            <CockpitBlock title="etiquetas" className="cockpit__sec--ref">
              <p className="chip-row">
                {deal.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </p>
            </CockpitBlock>
          ) : null}
        </aside>

        {/* ------- contêiner 2 (era o centro) ------- */}
        <div className="cockpit__center">
          <section className="card-hitl cockpit__sec--hitl" aria-labelledby="cockpit-next-action">
            <div className="card-hitl__head">
              <span className="dot dot--pulse" />
              <h3 className="card-hitl__title" id="cockpit-next-action">
                {nextBestAction.isAI ? 'o agente sugere o próximo passo' : 'próxima ação'}
              </h3>
              <span className="card-hitl__age">
                {nextBestAction.urgency === 'high'
                  ? 'urgente'
                  : nextBestAction.urgency === 'medium'
                    ? 'atenção'
                    : 'sem pressa'}
              </span>
            </div>
            <div className="card-hitl__inner">
              <p className="card-hitl__what">{nextBestAction.action}</p>
              <blockquote className="card-hitl__quote">{nextBestAction.reason}</blockquote>
              <p className="card-hitl__conf">
                <span>saúde do deal</span>
                <span className="card-hitl__conf-value">{health.score}%</span>
                <span className="card-hitl__conf-track">
                  <span
                    className="confidence__marker"
                    style={{ left: `${Math.min(100, Math.max(0, health.score))}%` }}
                  />
                </span>
                <button
                  type="button"
                  className="chip chip--ia"
                  onClick={() => void refetchAI()}
                  title="Reanalisar com IA"
                >
                  ✦ {aiLoading ? 'analisando…' : 'reanalisar'}
                </button>
              </p>
            </div>
            <p className="card-hitl__actions">
              <button
                type="button"
                className="btn btn--on-lime"
                onClick={() => void handleExecuteNext()}
              >
                executar agora
              </button>
              <button
                type="button"
                className="btn btn--on-lime-soft"
                onClick={() =>
                  openMessageComposer(
                    'WHATSAPP',
                    {
                      message: buildSuggestedWhatsAppMessage({
                        contact: contact ?? undefined,
                        deal,
                        actionType: nextBestAction.actionType,
                        action: nextBestAction.action,
                        reason: nextBestAction.reason,
                      }),
                    },
                    {
                      source: 'generated',
                      origin: 'nextBestAction',
                      aiSuggested: nextBestAction.isAI,
                      aiActionType: nextBestAction.actionType,
                    }
                  )
                }
              >
                gerar WhatsApp
              </button>
              <button
                type="button"
                className="btn btn--on-lime-soft"
                onClick={() =>
                  openMessageComposer(
                    'EMAIL',
                    {
                      subject: `Sobre ${deal.title}`,
                      message: buildSuggestedEmailBody({
                        contact: contact ?? undefined,
                        deal,
                        actionType: nextBestAction.actionType,
                        action: nextBestAction.action,
                        reason: nextBestAction.reason,
                      }),
                    },
                    {
                      source: 'generated',
                      origin: 'nextBestAction',
                      aiSuggested: nextBestAction.isAI,
                      aiActionType: nextBestAction.actionType,
                    }
                  )
                }
              >
                gerar e-mail
              </button>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn--ghost"
                disabled={isScriptsLoading || scripts.length === 0}
                onClick={() => openTemplatePicker('WHATSAPP')}
              >
                template WA
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={isScriptsLoading || scripts.length === 0}
                onClick={() => openTemplatePicker('EMAIL')}
              >
                template e-mail
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  openScheduleModal({
                    type: 'TASK',
                    title: 'Agendar próximo passo',
                    description: 'Criado no cockpit.',
                  })
                }
              >
                agendar
              </button>
            </p>
          </section>

          <section className="panel panel--flush cockpit__sec--historico">
            <div className="panel__head" style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
              <h3 className="panel__title title-sm">linha do tempo</h3>
              <span className="spacer" />
              <span className="chip-row">
                <button
                  type="button"
                  className={kindFilter === 'all' ? 'chip chip--active' : 'chip'}
                  onClick={() => setKindFilter('all')}
                >
                  tudo
                </button>
                {(['call', 'note', 'status'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={kindFilter === k ? 'chip chip--active' : 'chip'}
                    onClick={() => setKindFilter(k)}
                  >
                    {k === 'call' ? 'ligações' : k === 'note' ? 'notas' : 'mudanças'}
                  </button>
                ))}
                <button
                  type="button"
                  className={showSystemEvents ? 'chip chip--hitl' : 'chip'}
                  onClick={() => setShowSystemEvents((v) => !v)}
                  title="Eventos de sistema"
                >
                  sistema
                </button>
              </span>
            </div>

            <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
              <input
                className="input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="buscar na linha do tempo…"
                aria-label="Buscar na linha do tempo"
                style={{ padding: '7px 12px' }}
              />
            </div>

            {filteredTimelineItems.length === 0 ? (
              <div className="state-empty">
                <p className="state-empty__title">
                  {timelineItems.length === 0 ? 'sem atividades ainda' : 'sem resultados'}
                </p>
                <p className="state-empty__text">
                  {timelineItems.length === 0
                    ? 'Quando você registrar uma nota, ligação ou mudança de etapa, ela aparece aqui.'
                    : 'Tente limpar busca e filtros para ver tudo de novo.'}
                </p>
                {timelineItems.length !== 0 ? (
                  <p className="state-empty__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        setQuery('');
                        setKindFilter('all');
                        setShowSystemEvents(false);
                      }}
                    >
                      limpar filtros
                    </button>
                  </p>
                ) : null}
              </div>
            ) : (
              <ul className="timeline">
                {filteredTimelineItems.map((t) => {
                  const actorClass =
                    t.kind === 'system'
                      ? 'actor actor--auto'
                      : t.kind === 'status'
                        ? 'actor actor--ia'
                        : 'actor actor--humano';
                  const actorGlyph =
                    t.kind === 'system' ? '⚡' : t.kind === 'status' ? '✦' : getInitials(actor.name);
                  return (
                    <li key={t.id} className="timeline__item">
                      <span className={actorClass} aria-hidden="true">
                        {actorGlyph}
                      </span>
                      <div className="timeline__body">
                        <p className="timeline__text">{t.title}</p>
                        {t.subtitle ? <p className="timeline__meta">{t.subtitle}</p> : null}
                      </div>
                      {t.title === 'Moveu para' && t.subtitle ? (
                        <Chip tone={t.tone === 'success' ? 'success' : t.tone === 'danger' ? 'danger' : 'neutral'}>
                          {t.subtitle}
                        </Chip>
                      ) : null}
                      <span className="timeline__meta nowrap">{t.at}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Panel className="cockpit__sec--historico" title="escrever nota">
            <textarea
              className="input input--textarea"
              value={noteDraftTimeline}
              onChange={(e) => setNoteDraftTimeline(e.target.value)}
              placeholder="notas, resumo da call, próximos passos…"
              aria-label="Nota do deal"
            />
            <p className="composer__row">
              <span className="meta">Isso vira uma atividade do tipo nota no log do deal.</span>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn--primary"
                onClick={async () => {
                  const text = noteDraftTimeline.trim();
                  if (!text) {
                    pushToast('Escreva uma nota antes de salvar', 'danger');
                    return;
                  }

                  try {
                    await addActivity({
                      dealId: deal.id,
                      dealTitle: deal.title,
                      type: 'NOTE',
                      title: 'Nota',
                      description: text,
                      date: new Date().toISOString(),
                      completed: true,
                      user: actor,
                    });

                    setNoteDraftTimeline('');
                    pushToast('Nota salva', 'success');
                  } catch (e) {
                    pushToast(errorMessage(e, 'Não foi possível salvar a nota.'), 'danger');
                  }
                }}
              >
                salvar nota
              </button>
            </p>
          </Panel>

          <Panel
            className="cockpit__sec--historico"
            title="registrar o que aconteceu fora do CRM"
            bodyClassName="chip-row"
          >
            <button
              type="button"
              className="chip"
              onClick={async () => {
                const header = buildExecutionHeader({
                  channel: 'WHATSAPP',
                  context: { source: 'manual', origin: 'quickAction' },
                  outsideCRM: true,
                });
                try {
                  await addActivity({
                    dealId: deal.id,
                    dealTitle: deal.title,
                    type: 'NOTE',
                    title: 'WhatsApp',
                    description: `${header}\n\n---\n\nMensagem enviada (registrado fora do CRM).`,
                    date: new Date().toISOString(),
                    completed: true,
                    user: actor,
                  });
                  pushToast('WhatsApp registrado', 'success');
                } catch (e) {
                  pushToast(errorMessage(e, 'Não foi possível registrar o WhatsApp.'), 'danger');
                }
              }}
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
            </button>

            <button
              type="button"
              className="chip"
              onClick={async () => {
                const header = buildExecutionHeader({
                  channel: 'EMAIL',
                  context: { source: 'manual', origin: 'quickAction' },
                  outsideCRM: true,
                });
                try {
                  await addActivity({
                    dealId: deal.id,
                    dealTitle: deal.title,
                    type: 'EMAIL',
                    title: 'Email',
                    description: `${header}\nAssunto: Email\n\n---\n\nEnviado (registrado fora do CRM).`,
                    date: new Date().toISOString(),
                    completed: true,
                    user: actor,
                  });
                  pushToast('Email registrado', 'success');
                } catch (e) {
                  pushToast(errorMessage(e, 'Não foi possível registrar o email.'), 'danger');
                }
              }}
            >
              <Inbox className="h-3.5 w-3.5" aria-hidden="true" /> e-mail
            </button>

            <button
              type="button"
              className="chip"
              onClick={async () => {
                try {
                  await addActivity({
                    dealId: deal.id,
                    dealTitle: deal.title,
                    type: 'CALL',
                    title: 'Ligação',
                    description:
                      'Fonte: Cockpit\nFora do CRM: sim\n\n---\n\nRealizada (registrado fora do CRM).',
                    date: new Date().toISOString(),
                    completed: true,
                    user: actor,
                  });
                  pushToast('Ligação registrada', 'success');
                } catch (e) {
                  pushToast(errorMessage(e, 'Não foi possível registrar a ligação.'), 'danger');
                }
              }}
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" /> ligação
            </button>

            <button
              type="button"
              className="chip"
              onClick={async () => {
                try {
                  await addActivity({
                    dealId: deal.id,
                    dealTitle: deal.title,
                    type: 'MEETING',
                    title: 'Reunião',
                    description: 'Fonte: Cockpit\nFora do CRM: sim\n\n---\n\nRegistrada fora do CRM.',
                    date: new Date().toISOString(),
                    completed: true,
                    user: actor,
                  });
                  pushToast('Reunião registrada', 'success');
                } catch (e) {
                  pushToast(errorMessage(e, 'Não foi possível registrar a reunião.'), 'danger');
                }
              }}
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> reunião
            </button>

            <button
              type="button"
              className="chip"
              onClick={async () => {
                try {
                  await addActivity({
                    dealId: deal.id,
                    dealTitle: deal.title,
                    type: 'TASK',
                    title: 'Tarefa',
                    description: 'Fonte: Cockpit\nFora do CRM: sim\n\n---\n\nCriada (registrado fora do CRM).',
                    date: new Date().toISOString(),
                    completed: true,
                    user: actor,
                  });
                  pushToast('Tarefa registrada', 'success');
                } catch (e) {
                  pushToast(errorMessage(e, 'Não foi possível registrar a tarefa.'), 'danger');
                }
              }}
            >
              <ActivityIcon className="h-3.5 w-3.5" aria-hidden="true" /> tarefa
            </button>
          </Panel>
        </div>

        {/* ------- contêiner 3 (era a coluna direita) ------- */}
        <aside className="cockpit__aside cockpit__aside--right">
          <CockpitBlock title="risco do deal" className="cockpit__sec--risco">
            <div className="risk-row">
              {/* Enquanto a IA analisa, `health` cai no campo do deal — que num
                  deal novo é 0. A barra pintava 0% em vermelho e a palavra "alto"
                  aparecia, por um instante, como se fossem o diagnóstico; depois
                  saltava pra 50% laranja. Valor de carregamento com cara de valor
                  real é pior que ausência de valor. */}
              <p className={`risk risk--${aiLoading ? 'medio' : nivelRisco}`}>
                <span className="risk__level">
                  {aiLoading ? 'analisando…' : nivelRisco === 'medio' ? 'médio' : nivelRisco}
                </span>
                <span className="risk__text">{nextBestAction.reason}</span>
              </p>
              <div className="risk-stats">
                <div>
                  <p className="risk-stat__value num">
                    {riskStats.semResposta === null ? '—' : `${riskStats.semResposta} d`}
                  </p>
                  <p className="risk-stat__label">sem movimento</p>
                </div>
                <div>
                  <p className="risk-stat__value num">{riskStats.atividades}</p>
                  <p className="risk-stat__label">atividades</p>
                </div>
                <div>
                  <p className="risk-stat__value num">
                    {riskStats.noFunil === null ? '—' : `${riskStats.noFunil} d`}
                  </p>
                  <p className="risk-stat__label">no funil</p>
                </div>
              </div>
            </div>
            {/* Barra de saúde: o número já aparecia no texto do risco, mas em
                meio à frase. A barra dá a leitura de relance que a tela de
                governança pede, e a cor acompanha o nível — nunca limão, que
                aqui significa só "precisa da sua decisão". */}
            {/* Dois números de confiança na mesma linha, a 14px um do outro, sem
                dizer de quem era cada um: a barra mostrava a estimativa da IA
                (50%) e o texto ao lado a probabilidade gravada no deal (0%). Quem
                lê vê dois percentuais que deviam concordar e não concordam, e
                perde a confiança nos dois. Antes desta revisão eles viviam longe
                um do outro; foi o layout novo que os encostou.

                Quando a IA não respondeu, `health` já cai pro campo do deal e os
                dois são o mesmo número — aí a segunda menção só ocuparia linha. */}
            <p className="health section-card__split">
              <span className="label">
                saúde do deal{saudeVeioDaIA ? ' (estimativa da IA)' : ''}
              </span>
              <span className="health__track">
                <span
                  className={`health__fill health__fill--${nivelRisco}`}
                  style={{ width: aiLoading ? '0%' : `${Math.min(100, Math.max(0, health.score))}%` }}
                />
              </span>
              <span className="health__value num">{aiLoading ? '—' : `${health.score}%`}</span>
              {saudeVeioDaIA && (deal.probability ?? 50) !== health.score ? (
                <span className="meta">probabilidade gravada no deal: {deal.probability ?? 50}%</span>
              ) : null}
            </p>
          </CockpitBlock>

          <CockpitBlock
            className="cockpit__sec--passos"
            title="próximos passos"
            right={
              <button
                type="button"
                className="btn btn--quiet"
                style={{ padding: 0 }}
                onClick={loadChecklistFromDeal}
                title="Recarregar do deal"
              >
                recarregar
              </button>
            }
          >
            {checklist.length === 0 ? (
              <p className="meta">Sem itens ainda. Adicione abaixo.</p>
            ) : (
              <ul className="checklist checklist--grid">
                {checklist.map((it) => (
                  <li
                    key={it.id}
                    className={`checklist__item${it.done ? ' checklist__item--done' : ''}`}
                  >
                    <button
                      type="button"
                      className="checklist__box"
                      aria-label={it.done ? 'Marcar como não feito' : 'Marcar como feito'}
                      onClick={() => {
                        const next = checklist.map((x) =>
                          x.id === it.id ? { ...x, done: !x.done } : x
                        );
                        void persistChecklist(next);
                      }}
                    >
                      {it.done ? '✓' : ''}
                    </button>
                    <span style={{ flex: 1, minWidth: 0 }}>{it.text}</span>
                    <button
                      type="button"
                      className="btn btn--quiet"
                      style={{ padding: 0 }}
                      title="Remover"
                      onClick={() => {
                        const next = checklist.filter((x) => x.id !== it.id);
                        void persistChecklist(next);
                      }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="composer__row">
              <input
                className="input"
                value={checklistDraft}
                onChange={(e) => setChecklistDraft(e.target.value)}
                placeholder="adicionar item…"
                aria-label="Adicionar item ao checklist"
                style={{ padding: '7px 12px' }}
              />
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!checklistDraft.trim()}
                onClick={() => {
                  const text = checklistDraft.trim();
                  if (!text) return;
                  setChecklistDraft('');
                  const next = [...checklist, { id: uid('chk'), text, done: false }];
                  void persistChecklist(next);
                }}
              >
                add
              </button>
            </p>
          </CockpitBlock>

          <CockpitBlock
            className="cockpit__sec--assistente"
            title="agente IA"
            right={<span className="status-chip status-chip--ia">{board.name ?? 'pipeline'}</span>}
          >
            <div className="composer__channels">
              <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
                chat
              </TabButton>
              <TabButton active={tab === 'notas'} onClick={() => setTab('notas')}>
                notas
              </TabButton>
              <TabButton active={tab === 'scripts'} onClick={() => setTab('scripts')}>
                scripts
              </TabButton>
              <TabButton active={tab === 'arquivos'} onClick={() => setTab('arquivos')}>
                arquivos
              </TabButton>
            </div>

            {tab === 'chat' ? (
              // Altura fixa de 420px numa coluna que tem ~461px de altura útil
              // garantia scroll dentro de scroll: a roda do mouse rolava o
              // elemento errado dependendo de onde o cursor estivesse. Com clamp
              // o chat cede altura quando a janela é baixa e volta aos 420px
              // quando há espaço. Nenhuma prop do UIChat muda.
              <div
                className="panel panel--flush"
                style={{ height: 'clamp(220px, 38vh, 420px)', minHeight: 220, overflow: 'hidden' }}
              >
                <UIChat
                  boardId={board.id}
                  dealId={deal.id}
                  contactId={contact?.id}
                  cockpitSnapshot={cockpitSnapshot ?? undefined}
                  contextMode="props-only"
                  floating={false}
                  startMinimized={false}
                />
              </div>
            ) : tab === 'notas' ? (
              <div className="panel__body">
                <textarea
                  className="input input--textarea"
                  value={dealNoteDraft}
                  onChange={(e) => setDealNoteDraft(e.target.value)}
                  placeholder="escreva uma nota persistida…"
                  aria-label="Nota persistida"
                />
                <p className="composer__row">
                  <span className="meta">Salva em deal_notes.</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!dealNoteDraft.trim() || createNote.isPending}
                    onClick={async () => {
                      const content = dealNoteDraft.trim();
                      if (!content) return;
                      await createNote.mutateAsync(content);
                      setDealNoteDraft('');
                      pushToast('Nota persistida salva', 'success');
                    }}
                  >
                    {createNote.isPending ? 'salvando…' : 'adicionar'}
                  </button>
                </p>

                {isNotesLoading ? (
                  <p className="meta">carregando…</p>
                ) : notes.length === 0 ? (
                  <p className="meta">Sem notas ainda.</p>
                ) : (
                  <ul className="feed">
                    {notes.map((n) => (
                      <li key={n.id} className="feed__item">
                        <div className="feed__body">
                          <p className="feed__text" style={{ whiteSpace: 'pre-wrap' }}>
                            {n.content}
                          </p>
                          <p className="feed__meta">{formatAtISO(n.created_at)}</p>
                        </div>
                        <button
                          type="button"
                          className="btn btn--quiet"
                          style={{ padding: 0 }}
                          title="Copiar nota"
                          onClick={() => void copyToClipboard('Nota', n.content)}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--quiet"
                          style={{ padding: 0, color: 'var(--danger)' }}
                          title="Excluir"
                          onClick={() => void deleteNote.mutate(n.id)}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : tab === 'scripts' ? (
              <div className="panel__body">
                <p className="meta">{isScriptsLoading ? 'carregando…' : `${scripts.length} itens`}</p>
                <ul className="feed">
                  {scripts.map((s) => {
                    const info = getCategoryInfo(s.category);
                    const preview = applyVariables(s.template, templateVariables);
                    return (
                      <li key={s.id} className="feed__item">
                        <div className="feed__body">
                          <p className="chip-row">
                            <span className={scriptCategoryChipClass(info.color)}>{info.label}</span>
                            <span className="feed__text" style={{ fontWeight: 700 }}>
                              {s.title}
                            </span>
                          </p>
                          <p className="feed__meta" style={{ whiteSpace: 'pre-wrap' }}>
                            {preview}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn--quiet"
                          style={{ padding: 0 }}
                          title="Copiar"
                          onClick={() => void copyToClipboard('Script', preview)}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="panel__body">
                <p className="meta">{isFilesLoading ? 'carregando…' : `${files.length} itens`}</p>
                <input
                  type="file"
                  aria-label="Enviar arquivo"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await uploadFile.mutateAsync(f);
                    e.currentTarget.value = '';
                    pushToast('Arquivo enviado', 'success');
                  }}
                  style={{ fontSize: 12 }}
                />
                {files.length === 0 && !isFilesLoading ? (
                  <p className="meta">Nenhum arquivo.</p>
                ) : (
                  <ul className="feed">
                    {files.map((f) => (
                      <li key={f.id} className="feed__item">
                        <div className="feed__body">
                          <p className="feed__text">{f.file_name}</p>
                          <p className="feed__meta">
                            {formatFileSize(f.file_size)} · {formatAtISO(f.created_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn--quiet"
                          style={{ padding: 0 }}
                          title="Baixar"
                          onClick={() => downloadFile(f)}
                        >
                          <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--quiet"
                          style={{ padding: 0, color: 'var(--danger)' }}
                          title="Excluir"
                          onClick={() => void deleteFile.mutate({ fileId: f.id, filePath: f.file_path })}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CockpitBlock>

          <CockpitBlock title="contexto" className="cockpit__sec--ref">
            <p className="composer__row">
              <span className="meta">{crmLoading ? 'sincronizando…' : 'pronto'}</span>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void refreshCRM()}
                title="Recarregar dados do CRM"
              >
                recarregar
              </button>
            </p>
          </CockpitBlock>
        </aside>
      </div>

      <CallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        onSave={handleCallLogSave}
        contactName={contact?.name || 'Contato'}
        contactPhone={contact?.phone || ''}
        suggestedTitle={callSuggestedTitle}
      />

      <TemplatePickerModal
        isOpen={isTemplatePickerOpen}
        onClose={() => setIsTemplatePickerOpen(false)}
        mode={templatePickerMode}
        scripts={scripts}
        isLoading={isScriptsLoading}
        variables={templateVariables}
        applyVariables={applyVariables}
        getCategoryInfo={getCategoryInfo}
        onPick={handlePickTemplate}
      />

      <MessageComposerModal
        isOpen={isMessageModalOpen}
        onClose={() => {
          setIsMessageModalOpen(false);
          setMessagePrefill(null);
          setMessageLogContext(null);
        }}
        channel={messageChannel}
        contactName={contact?.name || 'Contato'}
        contactEmail={contact?.email}
        contactPhone={contact?.phone}
        initialSubject={messagePrefill?.subject}
        initialMessage={messagePrefill?.message}
        onExecuted={(ev) => void handleMessageExecuted(ev)}
        aiContext={{
          cockpitSnapshot: cockpitSnapshot ?? undefined,
          nextBestAction: {
            action: nextBestAction.action,
            reason: nextBestAction.reason,
            actionType: nextBestAction.actionType,
            urgency: nextBestAction.urgency,
          },
        }}
      />

      <ScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setScheduleInitial(null);
        }}
        onSave={(data) => void handleScheduleSave(data)}
        contactName={contact?.name || 'Contato'}
        initialType={scheduleInitial?.type}
        initialTitle={scheduleInitial?.title}
        initialDescription={scheduleInitial?.description}
      />
    </div>
  );
}
