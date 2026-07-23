import { describe, expect, it } from 'vitest'
import { validarPayloadProspeccao } from '../supabase/functions/ingest-prospeccao/contract'
import fixture from './fixtures/t2-payload.json'

/**
 * T2 — Teste de contrato cross-projeto (exigência do test plan do
 * PLANO-NOVO-FLUXO.md): a fixture compartilhada `test/fixtures/t2-payload.json`
 * é IDÊNTICA à `lib/fixtures/t2-payload.json` do repo prospeccao-aaagencia.
 * O lado de lá testa que o emissor PRODUZ este shape; este lado testa que o
 * receptor ACEITA este shape. Mudou o contrato → atualizar as duas cópias e o
 * HANDOFF.md do gerador (fonte de verdade).
 */
describe('contrato Prospecção → CRM (T2)', () => {
  it('aceita a fixture compartilhada', () => {
    const resultado = validarPayloadProspeccao(fixture)
    expect(resultado).toEqual({ ok: true, payload: fixture })
  })

  it('rejeita payload sem external_event_id', () => {
    const { external_event_id: _omit, ...resto } = fixture
    expect(validarPayloadProspeccao(resto).ok).toBe(false)
  })

  it('rejeita chave fora do formato lead:{id}:demo:{ciclo}', () => {
    expect(validarPayloadProspeccao({ ...fixture, external_event_id: 'lead:x:demo' }).ok).toBe(false)
    expect(validarPayloadProspeccao({ ...fixture, external_event_id: 'x' }).ok).toBe(false)
  })

  it('rejeita telefone fora do E.164 BR', () => {
    expect(
      validarPayloadProspeccao({ ...fixture, lead: { ...fixture.lead, telefone: '(31) 98888-7777' } }).ok,
    ).toBe(false)
    expect(
      validarPayloadProspeccao({ ...fixture, lead: { ...fixture.lead, telefone: '+15551234567' } }).ok,
    ).toBe(false)
  })

  it('rejeita origem desconhecida', () => {
    expect(validarPayloadProspeccao({ ...fixture, origem: 'smartzap' }).ok).toBe(false)
  })

  it('rejeita ciclo negativo/não-inteiro', () => {
    expect(validarPayloadProspeccao({ ...fixture, ciclo: -1 }).ok).toBe(false)
    expect(validarPayloadProspeccao({ ...fixture, ciclo: 1.5 }).ok).toBe(false)
  })

  it('exige demo.link quando tipo=link, aceita null quando tipo=pdf', () => {
    expect(validarPayloadProspeccao({ ...fixture, demo: { link: null, tipo: 'link' } }).ok).toBe(false)
    expect(validarPayloadProspeccao({ ...fixture, demo: { link: null, tipo: 'pdf' } }).ok).toBe(true)
  })

  it('rejeita mensagem_whatsapp vazia', () => {
    expect(validarPayloadProspeccao({ ...fixture, mensagem_whatsapp: '' }).ok).toBe(false)
  })

  it('rejeita enviado_em inválido', () => {
    expect(validarPayloadProspeccao({ ...fixture, enviado_em: 'ontem' }).ok).toBe(false)
  })
})
