'use client'

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSettingsController } from './hooks/useSettingsController';
import { TagsManager } from './components/TagsManager';
import { CustomFieldsManager } from './components/CustomFieldsManager';
import { ApiKeysSection } from './components/ApiKeysSection';
import { WebhooksSection } from './components/WebhooksSection';
import { DealStageEventsSection } from './components/DealStageEventsSection';
import { McpSection } from './components/McpSection';
import { ChannelsSection } from './components/ChannelsSection';
import { BusinessUnitsSection } from './components/BusinessUnitsSection';
import { WhatsAppSafetySection } from './components/WhatsAppSafetySection';
import { DataStorageSettings } from './components/DataStorageSettings';
import { ProductsCatalogManager } from './components/ProductsCatalogManager';
import { AICenterSettings } from './AICenterSettings';

import { UsersPage } from './UsersPage';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { SelectField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/button';

type SettingsTab = 'general' | 'ai' | 'integrations' | 'products';

/**
 * Mapa tab → rota real (as 4 rotas do REDESIGN-CRM.md, decisão #8).
 * Os tabs são navegação de verdade (`<Link>`), não estado local — a URL
 * sempre reflete a aba ativa.
 */
const TAB_ROUTES: Record<SettingsTab, string> = {
  general: '/settings',
  ai: '/settings/ai',
  integrations: '/settings/integracoes',
  products: '/settings/products',
};

const TAB_LABELS: Record<SettingsTab, string> = {
  general: 'geral',
  ai: 'configuração de IA',
  integrations: 'integrações',
  products: 'produtos & catálogo',
};

// =============================================================================
// Organização — nome real (organizations.name), editável por admin
// =============================================================================

const OrganizationPanel: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { organizationId } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Test environment: evita chamada de rede real (mesmo padrão do ProductsCatalogManager).
    if (process.env.NODE_ENV === 'test') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      if (!supabase || !organizationId) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle();
      if (!cancelled) {
        setName(data?.name || '');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const handleSave = async () => {
    if (!supabase || !organizationId || !name.trim()) return;
    setSaving(true);
    try {
      await supabase.from('organizations').update({ name: name.trim() }).eq('id', organizationId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel__title title-md">organização</h2>
      <dl className="form-grid">
        <dt>nome</dt>
        <dd>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSave}
            disabled={loading || saving || !isAdmin}
            aria-label="Nome da organização"
          />
        </dd>
      </dl>
    </section>
  );
};

interface GeneralSettingsProps {
  hash?: string;
  isAdmin: boolean;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ hash, isAdmin }) => {
  const controller = useSettingsController();

  // Scroll to hash element (e.g., #ai-config)
  useEffect(() => {
    if (hash) {
      const elementId = hash.slice(1); // Remove #
      setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [hash]);

  return (
    <div className="pb-10" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <OrganizationPanel isAdmin={isAdmin} />

      {isAdmin && (
        <section className="panel">
          <h2 className="panel__title title-md">time</h2>
          <UsersPage />
        </section>
      )}

      {/* Preferências pessoais */}
      <div className="mb-12">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Página Inicial</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Escolha qual tela deve abrir quando você iniciar o CRM.
          </p>
          <SelectField
            label="Página Inicial"
            containerClassName="max-w-xs"
            options={[
              { value: '/dashboard', label: 'Dashboard' },
              { value: '/inbox-list', label: 'Inbox (Lista)' },
              { value: '/inbox-focus', label: 'Inbox (Foco)' },
              { value: '/boards', label: 'Boards (Kanban)' },
              { value: '/contacts', label: 'Contatos' },
              { value: '/activities', label: 'Atividades' },
              { value: '/reports', label: 'Relatórios' },
            ]}
            value={controller.defaultRoute}
            onChange={(e) => controller.setDefaultRoute(e.target.value)}
            aria-label="Selecionar página inicial"
          />
        </div>
      </div>

      {isAdmin && (
        <>
          <TagsManager
            availableTags={controller.availableTags}
            newTagName={controller.newTagName}
            setNewTagName={controller.setNewTagName}
            onAddTag={controller.handleAddTag}
            onRemoveTag={controller.removeTag}
          />

          <CustomFieldsManager
            customFieldDefinitions={controller.customFieldDefinitions}
            newFieldLabel={controller.newFieldLabel}
            setNewFieldLabel={controller.setNewFieldLabel}
            newFieldType={controller.newFieldType}
            setNewFieldType={controller.setNewFieldType}
            newFieldOptions={controller.newFieldOptions}
            setNewFieldOptions={controller.setNewFieldOptions}
            editingId={controller.editingId}
            onStartEditing={controller.startEditingField}
            onCancelEditing={controller.cancelEditingField}
            onSaveField={controller.handleSaveField}
            onRemoveField={controller.removeCustomField}
          />

          <BusinessUnitsSection />

          <DataStorageSettings />
        </>
      )}
    </div>
  );
};

const ProductsSettings: React.FC = () => {
  return (
    <section className="panel panel--flush">
      <ProductsCatalogManager />
    </section>
  );
};

const IntegrationsSettings: React.FC = () => {
  type IntegrationsSubTab = 'channels' | 'webhooks' | 'api' | 'mcp' | 'whatsapp-safety';
  const [subTab, setSubTab] = useState<IntegrationsSubTab>('channels');

  useEffect(() => {
    const syncFromHash = () => {
    const h = typeof window !== 'undefined' ? (window.location.hash || '').replace('#', '') : '';
    if (h === 'channels' || h === 'webhooks' || h === 'api' || h === 'mcp' || h === 'whatsapp-safety') setSubTab(h as IntegrationsSubTab);
    };

    syncFromHash();

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', syncFromHash);
      return () => window.removeEventListener('hashchange', syncFromHash);
    }
  }, []);

  const setSubTabAndHash = (t: IntegrationsSubTab) => {
    setSubTab(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.hash = `#${t}`;
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-6">
        {([
          { id: 'channels' as const, label: 'Canais' },
          { id: 'webhooks' as const, label: 'Webhooks' },
          { id: 'api' as const, label: 'API' },
          { id: 'mcp' as const, label: 'MCP' },
          { id: 'whatsapp-safety' as const, label: 'Segurança WhatsApp' },
        ] as const).map((t) => {
          const active = subTab === t.id;
          return (
            <Button
              key={t.id}
              type="button"
              variant={active ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTabAndHash(t.id)}
            >
              {t.label}
            </Button>
          );
        })}
      </div>

      {subTab === 'channels' && <ChannelsSection />}
      {subTab === 'api' && <ApiKeysSection />}
      {subTab === 'webhooks' && (
        <>
          <WebhooksSection />
          <DealStageEventsSection />
        </>
      )}
      {subTab === 'mcp' && <McpSection />}
      {subTab === 'whatsapp-safety' && <WhatsAppSafetySection />}
    </div>
  );
};

interface SettingsPageProps {
  tab?: SettingsTab;
}

/**
 * Componente React `SettingsPage`.
 *
 * As 4 rotas reais (`/settings`, `/settings/ai`, `/settings/integracoes`,
 * `/settings/products`) apontam pra este componente, cada uma passando seu
 * próprio `tab` — a navegação entre abas usa `<Link>` de verdade (a URL
 * reflete a aba ativa), ver REDESIGN-CRM.md decisão #8.
 *
 * @param {SettingsPageProps} { tab: initialTab } - Parâmetro `{ tab: initialTab }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
const SettingsPage: React.FC<SettingsPageProps> = ({ tab: initialTab }) => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'general');
  const isAdmin = profile?.role === 'admin';

  // Get hash from URL for scrolling
  const hash = typeof window !== 'undefined' ? window.location.hash : '';

  // Cada uma das 4 rotas reais passa seu próprio `tab` (ver page.tsx de
  // `/settings`, `/settings/ai`, `/settings/integracoes`, `/settings/products`).
  // Ressincroniza o estado quando a prop muda — cobre o caso em que o App
  // Router reaproveita a mesma instância de componente entre navegações
  // client-side (sem remontar), já que os tabs agora são `<Link>` de verdade.
  useEffect(() => {
    setActiveTab(initialTab || 'general');
  }, [initialTab]);

  const tabs: SettingsTab[] = isAdmin
    ? ['general', 'ai', 'integrations', 'products']
    : ['general', 'ai'];

  const renderContent = () => {
    switch (activeTab) {
      case 'products':
        return <ProductsSettings />;
      case 'integrations':
        return <IntegrationsSettings />;
      case 'ai':
        return <AICenterSettings />;
      default:
        return <GeneralSettings hash={hash} isAdmin={isAdmin} />;
    }
  };

  return (
    <div className="screen__inner screen__inner--narrow">
      <nav className="tabs" aria-label="Seções de configuração">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={TAB_ROUTES[tab]}
            className={`tab ${activeTab === tab ? 'tab--active' : ''}`}
            aria-current={activeTab === tab ? 'page' : undefined}
          >
            {TAB_LABELS[tab]}
          </Link>
        ))}
      </nav>

      {renderContent()}
    </div>
  );
};

export default SettingsPage;
