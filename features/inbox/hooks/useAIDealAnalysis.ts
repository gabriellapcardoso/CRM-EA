/**
 * AI Deal Analysis Hook
 * Fetches real AI analysis for a deal using the AI Proxy
 */
import { useQuery } from '@tanstack/react-query';
import { AITaskClientError, analyzeLead } from '@/lib/ai/tasksClient';
import { Deal, DealView } from '@/types';

export interface AIAnalysis {
    action: string;       // Ação curta (max 50 chars)
    reason: string;       // Razão breve (max 80 chars)
    actionType: 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'WHATSAPP';
    urgency: 'low' | 'medium' | 'high';
    /** Ausente quando não há análise real (erro) — nunca um número inventado. */
    probabilityScore?: number;
    error?: string;
    /** Código HTTP da AI task (AI_DISABLED, AI_FEATURE_DISABLED, UNAUTHORIZED, ...). Ver `describeAIError`. */
    errorCode?: string;
    // Legacy field for backward compatibility
    suggestion?: string;
}

/**
 * Traduz o código de erro de uma AI task pra texto que a operadora vê.
 *
 * Só falha de rede, `INTERNAL_ERROR` e código desconhecido são queda de
 * verdade. `AI_DISABLED`/`AI_FEATURE_DISABLED` (org desligou de propósito),
 * `AI_KEY_NOT_CONFIGURED` (falta configurar) e `UNAUTHORIZED` (sessão
 * expirada) não são "IA fora do ar" — dizer isso reporta uma queda que não
 * existe e queima a credibilidade do aviso na próxima queda real.
 * Issue #23, item 2.
 */
export function describeAIError(errorCode: string | undefined): string {
    switch (errorCode) {
        case 'AI_DISABLED':
        case 'AI_FEATURE_DISABLED':
            return 'Análise por IA desativada pela organização';
        case 'AI_KEY_NOT_CONFIGURED':
            return 'IA sem configuração — configure em Configurações → Inteligência Artificial';
        case 'UNAUTHORIZED':
            return 'Sessão expirada — atualize a página';
        default:
            return 'IA fora do ar — sugestão indisponível';
    }
}

/**
 * Constrói o `AIAnalysis` de fallback quando a AI task falha.
 *
 * Extraída do `queryFn` pra ser testável sem montar `useQuery`/React: o que
 * importa verificar é que `probabilityScore` nunca vem preenchido aqui (issue
 * #23, item 2) e que o `errorCode` de um `AITaskClientError` é preservado.
 */
export function buildFailureAnalysis(error: unknown): AIAnalysis {
    return {
        action: 'Analisar deal manualmente',
        reason: 'Não foi possível obter análise da IA',
        actionType: 'TASK' as const,
        urgency: 'low' as const,
        // Sem score inventado — quem consome cai pro probability real do
        // deal (ou "sem dado"), nunca um número de IA falso.
        probabilityScore: undefined,
        error: String(error),
        errorCode: error instanceof AITaskClientError ? error.code : undefined,
    };
}

/**
 * Hook to get AI-powered analysis for a deal
 * Returns actionable NBA with structured data
 */
export function useAIDealAnalysis(
    deal: Deal | DealView | null | undefined,
    stageLabel?: string,
    options?: { enabled?: boolean }
) {
    return useQuery<AIAnalysis>({
        queryKey: ['ai-deal-analysis', deal?.id, stageLabel],
        queryFn: async () => {
            if (!deal) {
                return {
                    action: '',
                    reason: '',
                    actionType: 'TASK' as const,
                    urgency: 'low' as const,
                    probabilityScore: 0
                };
            }

            try {
                const result = await analyzeLead(deal, stageLabel);

                return result as AIAnalysis;
            } catch (error) {
                console.error('[AI Analysis] Error:', error);
                return buildFailureAnalysis(error);
            }
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
        enabled: options?.enabled !== false && !!deal?.id,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

/**
 * Derive health score from AI probability
 * Maps 0-100 probability to a health status
 */
export function deriveHealthFromProbability(probability: number): {
    score: number;
    status: 'critical' | 'warning' | 'good' | 'excellent';
    color: string;
} {
    if (probability >= 80) {
        return { score: probability, status: 'excellent', color: 'text-emerald-400' };
    } else if (probability >= 60) {
        return { score: probability, status: 'good', color: 'text-green-400' };
    } else if (probability >= 40) {
        return { score: probability, status: 'warning', color: 'text-orange-400' };
    } else {
        return { score: probability, status: 'critical', color: 'text-red-400' };
    }
}
