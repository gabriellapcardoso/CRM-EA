/**
 * Testes da barra lateral ocultável (2026-08-31).
 *
 * Duas coisas cobertas aqui:
 *
 * 1. `getSidebarWidth()` — alimenta a CSS var `--app-sidebar-width`, que ~30
 *    modais usam pra posicionar o overlay (`md:left-[var(--app-sidebar-width)]`).
 *    Se a var não zerar quando a barra some, TODOS esses modais ficam
 *    deslocados 236px pra direita. É o ponto de maior blast radius da feature.
 *
 * 2. O estado `sidebarHidden` no UIStore — preferência explícita do usuário,
 *    separada de `sidebarCollapsed` (automático/efêmero, usado pelo Inbox).
 *    Os dois são intencionalmente independentes: ocultar pelo botão não pode
 *    ser desfeito por um efeito colateral do Inbox, e vice-versa.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { getSidebarWidth, SIDEBAR_HIDDEN_KEY } from '@/components/Layout'
import { useUIStore } from '@/lib/stores'

describe('getSidebarWidth', () => {
  it('desktop com a barra visível reserva 236px', () => {
    expect(getSidebarWidth('desktop', false)).toBe('236px')
  })

  it('desktop com a barra oculta zera a var (senão os ~30 modais deslocam)', () => {
    expect(getSidebarWidth('desktop', true)).toBe('0px')
  })

  it('tablet usa o rail de 5rem, e ocultar não se aplica (o botão nem aparece)', () => {
    expect(getSidebarWidth('tablet', false)).toBe('5rem')
    expect(getSidebarWidth('tablet', true)).toBe('5rem')
  })

  it('mobile não reserva espaço em nenhum caso', () => {
    expect(getSidebarWidth('mobile', false)).toBe('0px')
    expect(getSidebarWidth('mobile', true)).toBe('0px')
  })
})

describe('UIStore — sidebarHidden', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarHidden: false, sidebarCollapsed: false })
  })

  it('começa visível', () => {
    expect(useUIStore.getState().sidebarHidden).toBe(false)
  })

  it('toggle inverte o estado', () => {
    useUIStore.getState().toggleSidebarHidden()
    expect(useUIStore.getState().sidebarHidden).toBe(true)

    useUIStore.getState().toggleSidebarHidden()
    expect(useUIStore.getState().sidebarHidden).toBe(false)
  })

  it('setSidebarHidden grava o valor recebido', () => {
    useUIStore.getState().setSidebarHidden(true)
    expect(useUIStore.getState().sidebarHidden).toBe(true)
  })

  it('é independente de sidebarCollapsed (efêmero, usado pelo Inbox)', () => {
    useUIStore.getState().setSidebarHidden(true)
    useUIStore.getState().setSidebarCollapsed(true)
    useUIStore.getState().setSidebarCollapsed(false)

    // O Inbox mexer no collapsed não pode reverter a preferência do usuário.
    expect(useUIStore.getState().sidebarHidden).toBe(true)
  })
})

describe('chave de persistência', () => {
  it('segue a convenção crm_* do projeto', () => {
    expect(SIDEBAR_HIDDEN_KEY).toBe('crm_sidebar_hidden')
  })
})
