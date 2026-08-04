/**
 * @fileoverview Layout Principal da Aplicação
 *
 * Shell (sidebar + topbar) redesenhado em 2026-08 a partir do handoff
 * "Redesign CRM" — ver REDESIGN-CRM.md. Vocabulário visual vem de
 * `.sidebar`/`.nav`/`.topbar`/`.pill-hitl` etc. (app/globals.css).
 *
 * @module components/Layout
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Sparkles, LogOut, User, Bug } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUIStore } from '@/lib/stores';
import { prefetchRoute, RouteName } from '@/lib/prefetch';
import { isDebugMode, enableDebugMode, disableDebugMode } from '@/lib/debug';
import { SkipLink } from '@/lib/a11y';
import { useResponsiveMode } from '@/hooks/useResponsiveMode';
import { BottomNav, MoreMenuSheet, NavigationRail } from '@/components/navigation';
import { useUnreadCount } from '@/lib/query/hooks/useConversationsQuery';
import decisionQueueService from '@/features/decisions/services/decisionQueueService';
import { UIChat } from './ai/UIChat';
import { NotificationPopover } from './notifications/NotificationPopover';

const PAGE_TITLES: Record<string, { heading: string; sub: string }> = {
  '/dashboard': { heading: 'Dashboard', sub: 'visão geral do pós-venda' },
  '/boards': { heading: 'Negociação', sub: 'kanban das oportunidades abertas' },
  '/pipeline': { heading: 'Negociação', sub: 'kanban das oportunidades abertas' },
  '/inbox': { heading: 'Inbox', sub: 'o que precisa da sua atenção agora' },
  '/messaging': { heading: 'Mensagens', sub: 'conversas por WhatsApp, e-mail e Instagram' },
  '/contacts': { heading: 'Contatos', sub: 'pessoas e empresas do seu funil' },
  '/activities': { heading: 'Atividades', sub: 'tarefas, ligações e follow-ups' },
  '/decisions': { heading: 'IA · decisões', sub: 'o que o agente fez e o que espera você' },
  '/ai': { heading: 'Assistente IA', sub: 'converse com o agente' },
  '/reports': { heading: 'Relatórios', sub: 'funil, ganhos e desempenho do agente' },
  '/settings': { heading: 'Configurações', sub: 'organização, IA, integrações e produtos' },
  '/profile': { heading: 'Perfil', sub: 'sua conta e preferências' },
};

const getPageMeta = (pathname: string) => {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const prefix = Object.keys(PAGE_TITLES).find((key) => pathname.startsWith(key + '/'));
  return prefix ? PAGE_TITLES[prefix] : { heading: '', sub: '' };
};

interface LayoutProps {
  children: React.ReactNode;
}

interface NavLinkProps {
  to: string;
  label: string;
  prefetch?: RouteName;
  badge?: number;
  isActive: boolean;
}

const NavLink = ({ to, label, prefetch, badge, isActive }: NavLinkProps) => (
  <Link
    href={to}
    onMouseEnter={prefetch ? () => prefetchRoute(prefetch) : undefined}
    onFocus={prefetch ? () => prefetchRoute(prefetch) : undefined}
    className={`nav__item${isActive ? ' nav__item--active' : ''}`}
    aria-current={isActive ? 'page' : undefined}
  >
    {label}
    {(badge ?? 0) > 0 && <span className="badge-count">{badge! > 99 ? '99+' : badge}</span>}
  </Link>
);

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { aiAssistantOpen, setAIAssistantOpen } = useUIStore();
  const { user, loading, profile, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { mode } = useResponsiveMode();
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const isDesktop = mode === 'desktop';
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [pendingDecisions, setPendingDecisions] = useState(0);

  const { data: unreadMessagesCount = 0 } = useUnreadCount();

  useEffect(() => {
    setDebugEnabled(isDebugMode());
  }, []);

  // Contagem de decisões pendentes (localStorage) — lida após montar pra evitar mismatch de hidratação.
  useEffect(() => {
    const refresh = () => setPendingDecisions(decisionQueueService.getPendingDecisions().length);
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const width = isDesktop ? '236px' : isTablet ? '5rem' : '0px';
    document.documentElement.style.setProperty('--app-sidebar-width', width);
    return () => document.documentElement.style.setProperty('--app-sidebar-width', '0px');
  }, [isDesktop, isTablet]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--app-bottom-nav-height', isMobile ? '56px' : '0px');
  }, [isMobile]);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  const toggleDebugMode = () => {
    if (debugEnabled) {
      disableDebugMode();
      setDebugEnabled(false);
    } else {
      enableDebugMode();
      setDebugEnabled(true);
    }
  };

  const userInitials =
    profile?.first_name && profile?.last_name
      ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
      : profile?.nickname?.substring(0, 2).toUpperCase() || profile?.email?.substring(0, 2).toUpperCase() || 'U';
  const userName = profile?.nickname || profile?.first_name || profile?.email?.split('@')[0] || 'Usuário';
  const userRole = profile?.role === 'admin' ? 'administradora' : profile?.role === 'vendedor' ? 'vendedora' : '';

  if (!loading && !user) return null;

  const { heading, sub } = getPageMeta(pathname);
  const isBoardsActive = pathname === '/boards' || pathname === '/pipeline';

  return (
    <div className="app">
      <SkipLink targetId="main-content" />

      {isTablet ? <NavigationRail /> : null}

      {isDesktop && (
        <aside className="sidebar" aria-label="Menu principal">
          <div className="sidebar__brand">
            <Image className="logo" src="/brand/logo-aaagencia-white.png" alt="aaagência" width={100} height={26} unoptimized />
          </div>
          <nav className="nav" aria-label="Navegação do sistema">
            <div className="nav__group">
              <p className="nav__label">trabalho</p>
              <NavLink to="/dashboard" label="Dashboard" prefetch="dashboard" isActive={pathname === '/dashboard'} />
              <NavLink to="/boards" label="Negociação" prefetch="boards" isActive={isBoardsActive} />
              <NavLink to="/inbox" label="Inbox" prefetch="inbox" isActive={pathname === '/inbox'} />
              <NavLink to="/messaging" label="Mensagens" badge={unreadMessagesCount} isActive={pathname.startsWith('/messaging')} />
              <NavLink to="/contacts" label="Contatos" prefetch="contacts" isActive={pathname === '/contacts'} />
              <NavLink to="/activities" label="Atividades" prefetch="activities" isActive={pathname === '/activities'} />
            </div>
            <div className="nav__group">
              <p className="nav__label">inteligência</p>
              <NavLink to="/decisions" label="IA · aprovações" badge={pendingDecisions} isActive={pathname === '/decisions'} />
              <NavLink to="/reports" label="Relatórios" prefetch="reports" isActive={pathname === '/reports'} />
            </div>
            <div className="nav__group">
              <p className="nav__label">sistema</p>
              <NavLink to="/settings" label="Configurações" prefetch="settings" isActive={pathname.startsWith('/settings')} />
              <NavLink to="/profile" label="Perfil" isActive={pathname === '/profile'} />
            </div>
          </nav>

          <div className="sidebar__user" style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((v) => !v)}
              className="sidebar__user"
              style={{ padding: 0, border: 0, background: 'none', width: '100%', textAlign: 'left' }}
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
            >
              {profile?.avatar_url ? (
                <Image src={profile.avatar_url} alt="" width={32} height={32} className="avatar avatar--md" style={{ objectFit: 'cover' }} unoptimized />
              ) : (
                <span className="avatar avatar--pink avatar--md">{userInitials}</span>
              )}
              <span className="sidebar__user-text">
                <span className="sidebar__user-name">{userName}</span>
                <span className="sidebar__user-role">{userRole}</span>
              </span>
            </button>

            {isUserMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)} aria-hidden="true" />
                <div
                  role="menu"
                  className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-white rounded-xl shadow-xl border border-[var(--border-subtle)] overflow-hidden"
                >
                  <div className="p-1">
                    <Link
                      href="/profile"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--ink-700)] hover:bg-[var(--surface-subtle)] rounded-lg transition-colors"
                    >
                      <User className="w-4 h-4" />
                      editar perfil
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      sair da conta
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      )}

      <div className="main">
        <header className="topbar">
          <div className="topbar__title">
            <h1 className="topbar__heading">{heading}</h1>
            {sub && <p className="topbar__sub">{sub}</p>}
          </div>
          <span className="spacer" />

          <button
            type="button"
            onClick={() => setAIAssistantOpen(!aiAssistantOpen)}
            className="btn btn--ghost"
            aria-pressed={aiAssistantOpen}
            title="Assistente IA"
          >
            <Sparkles size={16} aria-hidden="true" />
          </button>

          {process.env.NODE_ENV === 'development' && (
            <button
              type="button"
              onClick={toggleDebugMode}
              className="btn btn--ghost"
              aria-pressed={debugEnabled}
              title="Modo debug"
            >
              <Bug size={16} aria-hidden="true" />
            </button>
          )}

          <NotificationPopover />

          {pendingDecisions > 0 && (
            <Link className="pill-hitl" href="/decisions">
              <span className="dot dot--pulse" />
              {pendingDecisions} decis{pendingDecisions === 1 ? 'ão' : 'ões'} aguardando você
            </Link>
          )}
          <p className="status status--on">
            <span className="dot" />
            agente ativo
          </p>
        </header>

        {/*
          Cada página decide seu próprio wrapper de conteúdo — algumas usam
          `.screen__inner(--wide|--narrow)` com padding (dashboard, contatos,
          atividades, relatórios, decisões, configurações, perfil), outras são
          full-bleed dentro de `.screen` (inbox, negociação/boards, mensagens,
          cockpit de deal). Ver REDESIGN-CRM.md.
        */}
        <main id="main-content" className="screen" tabIndex={-1}>
          {children}
        </main>
      </div>

      <aside
        aria-label="Assistente de IA"
        aria-hidden={!aiAssistantOpen}
        className={`border-l border-[var(--border-subtle)] bg-white transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${aiAssistantOpen ? 'w-96 opacity-100' : 'w-0 opacity-0'}`}
      >
        <div className="w-96 h-full">{aiAssistantOpen && <UIChat />}</div>
      </aside>

      <BottomNav onOpenMore={() => setIsMoreOpen(true)} />
      <MoreMenuSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </div>
  );
};

export default Layout;
