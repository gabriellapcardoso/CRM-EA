/**
 * Testes do enforcement `requires_human_advance` (T1 — PLANO-NOVO-FLUXO).
 *
 * Regra: estágio destino com requires_human_advance NUNCA é auto-avançado
 * pelo agente IA — mesmo com confidence >= hitlThreshold, vira pending
 * advance (aprovação humana). Ex.: "Topou proposta" no board Negociação,
 * que futuramente dispara T3 (CRM → Gerador de Propostas).
 */

import { describe, expect, it } from 'vitest'
import { determineHITLDecision, DEFAULT_HITL_CONFIG } from '@/lib/ai/agent/hitl-stage-advance'

describe('determineHITLDecision — requires_human_advance (T1)', () => {
  it('confidence alta + estágio comum → auto-avança (comportamento existente)', () => {
    const d = determineHITLDecision(0.95, true, DEFAULT_HITL_CONFIG, false)
    expect(d.autoAdvance).toBe(true)
    expect(d.requiresConfirmation).toBe(false)
  })

  it('confidence alta + requires_human → NUNCA auto-avança, cria pending', () => {
    const d = determineHITLDecision(0.99, true, DEFAULT_HITL_CONFIG, true)
    expect(d.autoAdvance).toBe(false)
    expect(d.requiresConfirmation).toBe(true)
    expect(d.skipSuggestion).toBe(false)
  })

  it('confidence exatamente no threshold + requires_human → pending', () => {
    const d = determineHITLDecision(0.85, true, DEFAULT_HITL_CONFIG, true)
    expect(d.autoAdvance).toBe(false)
    expect(d.requiresConfirmation).toBe(true)
  })

  it('confidence média + requires_human → pending (igual ao fluxo normal)', () => {
    const d = determineHITLDecision(0.75, true, DEFAULT_HITL_CONFIG, true)
    expect(d.autoAdvance).toBe(false)
    expect(d.requiresConfirmation).toBe(true)
  })

  it('confidence baixa + requires_human → não sugere (min continua valendo)', () => {
    const d = determineHITLDecision(0.5, true, DEFAULT_HITL_CONFIG, true)
    expect(d.skipSuggestion).toBe(true)
    expect(d.requiresConfirmation).toBe(false)
  })

  it('shouldAdvance=false + requires_human → não sugere', () => {
    const d = determineHITLDecision(0.99, false, DEFAULT_HITL_CONFIG, true)
    expect(d.skipSuggestion).toBe(true)
  })

  it('default (parâmetro omitido) → comportamento antigo preservado', () => {
    const d = determineHITLDecision(0.95, true)
    expect(d.autoAdvance).toBe(true)
  })
})
