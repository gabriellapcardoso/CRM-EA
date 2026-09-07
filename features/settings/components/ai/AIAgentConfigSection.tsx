'use client';

/**
 * AIAgentConfigSection — Container principal para configuração do AI Agent.
 *
 * Fluxo simplificado:
 * 1. Se sem API key → aviso
 * 2. Se com API key → BoardAgentsSection com toggles inline é o foco principal
 * 3. "Configurações avançadas" colapsável expõe: modos (BANT/SPIN/etc.), AI Takeover, HITL
 *
 * Ao detectar primeiro acesso (sem ai_config_mode), provisiona zero_config silenciosamente.
 */

import { useEffect, useRef, useState } from 'react';
import { Bot, Sparkles, AlertCircle, Timer, Brain, ChevronDown } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AIConfigModeSelector, type AIConfigMode } from './AIConfigModeSelector';
import { BoardAgentsSection } from './BoardAgentsSection';
import { ZeroConfigMode } from './modes/ZeroConfigMode';
import { TemplateSelectionMode } from './modes/TemplateSelectionMode';
import { AutoLearnMode } from './modes/AutoLearnMode';
import { AdvancedMode } from './modes/AdvancedMode';
import {
  useAIConfigQuery,
  useUpdateAIConfigMutation,
  useProvisionStagesMutation,
} from '@/lib/query/hooks/useAIConfigQuery';
import { useOrgSettings } from '@/lib/query/hooks/useOrgSettingsQuery';
import { cn } from '@/lib/utils';

// =============================================================================
// Component
// =============================================================================

export function AIAgentConfigSection() {
  const { data: settings } = useOrgSettings();
  const aiKeyConfigured = settings?.aiKeyConfigured ?? false;
  const { data: config, isLoading, error } = useAIConfigQuery();
  const updateConfig = useUpdateAIConfigMutation();
  const provisionStages = useProvisionStagesMutation();

  const [selectedMode, setSelectedMode] = useState<AIConfigMode | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasProvisioned = useRef(false);

  // Provisiona zero_config silenciosamente no primeiro acesso
  useEffect(() => {
    if (hasProvisioned.current) return;
    if (!config || config.ai_config_mode) return;

    hasProvisioned.current = true;
    updateConfig.mutateAsync({ ai_config_mode: 'zero_config' })
      .then(() => provisionStages.mutateAsync())
      .catch((e: unknown) => console.error('[AIAgentConfig] Auto-provision failed:', e));
  }, [config]); // deps: only config matters — mutations are stable refs

  const currentMode = selectedMode || (config?.ai_config_mode as AIConfigMode) || 'zero_config';

  const handleModeChange = async (mode: AIConfigMode) => {
    setSelectedMode(mode);
    try {
      await updateConfig.mutateAsync({ ai_config_mode: mode });
      if (mode === 'zero_config') {
        await provisionStages.mutateAsync();
      }
    } catch (e) {
      console.error('[AIAgentConfig] Failed to update mode:', e);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
        <div className="h-48 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar configuração de IA: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!aiKeyConfigured) {
    return (
      <div className="space-y-4">
        <Header />
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            Configure uma chave de API acima para ativar o AI Agent.
            O agente responderá automaticamente às mensagens dos leads.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Foco principal: controles inline por board */}
      <BoardAgentsSection />

      {/* Configurações avançadas — colapsável */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-slate-400" />
            Configurações avançadas do agente
          </span>
          <ChevronDown
            className={cn('w-4 h-4 text-slate-400 transition-transform', showAdvanced && 'rotate-180')}
          />
        </button>

        {showAdvanced && (
          <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-white/5 pt-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Escolha a metodologia de qualificação que o agente usa por padrão em todos os funis.
            </p>

            {/* Mode Selector */}
            <AIConfigModeSelector currentMode={currentMode} onModeChange={handleModeChange} />

            {/* Mode Content */}
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-lg p-4">
              {currentMode === 'zero_config' && <ZeroConfigMode config={config} />}
              {currentMode === 'template' && <TemplateSelectionMode config={config} />}
              {currentMode === 'auto_learn' && <AutoLearnMode config={config} />}
              {currentMode === 'advanced' && <AdvancedMode config={config} />}
            </div>

            {/* AI Takeover */}
            <AITakeoverSection config={config} onUpdate={updateConfig.mutateAsync} />

            {/* HITL Stage Advancement */}
            <HITLConfigSection />
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// AI Takeover Section
// =============================================================================

function AITakeoverSection({
  config,
  onUpdate,
}: {
  config: ReturnType<typeof useAIConfigQuery>['data'];
  onUpdate: (params: { ai_takeover_enabled?: boolean; ai_takeover_minutes?: number }) => Promise<unknown>;
}) {
  const takeoverEnabled = config?.ai_takeover_enabled ?? false;

  const handleToggle = async () => {
    try {
      await onUpdate({ ai_takeover_enabled: !takeoverEnabled });
    } catch (e) {
      console.error('[AITakeover] Toggle failed:', e);
    }
  };

  // O seletor de "tempo de inatividade" saiu daqui em 07/09/2026. A regra
  // deixou de ter janela: conversa que um humano atendeu é do humano até alguém
  // devolvê-la ao agente. Manter o campo na tela seria oferecer um botão que o
  // código não lê mais — a coluna `ai_takeover_minutes` continua no banco por
  // compatibilidade, sem ninguém escrevendo nela por aqui.

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-100 dark:bg-amber-900/20 rounded-lg text-amber-600 dark:text-amber-400">
            <Timer size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Conversa Atendida por Humano
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Se alguém do time responder, a IA para de falar naquela conversa
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={takeoverEnabled}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            takeoverEnabled ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
              takeoverEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {takeoverEnabled && (
        <div className="mt-4 pl-10">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Basta uma resposta de alguém do time — pelo CRM ou pelo WhatsApp no celular — para
            a IA passar a só observar aquela conversa. Ela não volta a falar sozinha depois de
            um tempo: quem devolve a conversa ao agente é você, pelo painel da conversa.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Conversa que ninguém do time respondeu continua com o agente normalmente.
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// HITL Stage Advancement Section
// =============================================================================

function HITLConfigSection() {
  const { data: aiConfig, isLoading } = useAIConfigQuery();
  const updateMutation = useUpdateAIConfigMutation();

  const isAutonomous = (aiConfig?.ai_hitl_threshold ?? 0.85) <= 0.70;

  const handleToggle = async () => {
    const newThreshold = isAutonomous ? 0.85 : 0.70;
    try {
      await updateMutation.mutateAsync({ ai_hitl_threshold: newThreshold });
    } catch (e) {
      console.error('[HITLConfig] Toggle failed:', e);
    }
  };

  if (isLoading) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-500/20 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-amber-900 dark:text-amber-100 flex items-center gap-2 text-sm">
            <Brain size={16} className="text-amber-600" />
            Avanço de Estágio por IA
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            {isAutonomous ? (
              <span><strong>Modo Autônomo:</strong> Leads avançam automaticamente quando a IA tem ≥70% de confiança.</span>
            ) : (
              <span><strong>Modo Supervisionado:</strong> Você aprova avanços quando a IA tem 70-85% de confiança.</span>
            )}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isAutonomous}
            onChange={handleToggle}
            disabled={updateMutation.isPending}
            className="sr-only peer"
            aria-label="Alternar modo autônomo"
          />
          <div className="w-11 h-6 bg-amber-500 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-amber-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-500 dark:peer-checked:bg-green-600" />
        </label>
      </div>
      {!isAutonomous && (
        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-500/20">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            💡 No modo supervisionado, você verá notificações no <strong>Inbox</strong> quando a IA sugerir avanços.
            Avanços com &gt;85% de confiança ainda são automáticos.
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Header
// =============================================================================

function Header() {
  return (
    <div className="flex items-center gap-3">
      <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg text-emerald-600 dark:text-emerald-400">
        <Bot size={24} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
          Agente de IA
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure como o agente responde automaticamente às conversas.
        </p>
      </div>
    </div>
  );
}
