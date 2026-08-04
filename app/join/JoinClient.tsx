'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/utils/errorUtils'
import { Loader2 } from 'lucide-react'

/**
 * Componente React `JoinClient`.
 *
 * @param {{ token: string | null; }} { token } - Parâmetro `{ token }` (opcional, lê da URL se não fornecido).
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export function JoinClient({ token: tokenProp }: { token?: string | null }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Lê o token da URL se não foi fornecido como prop (fallback para compatibilidade)
  const token = tokenProp ?? searchParams.get('token')

  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [inviteData, setInviteData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  })

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError('Link de convite inválido ou ausente.')
        setValidating(false)
        return
      }

      try {
        const res = await fetch(`/api/invites/validate?token=${encodeURIComponent(token)}`, {
          method: 'GET',
          headers: { accept: 'application/json' },
        })

        const payload = await res.json().catch(() => null)

        if (!res.ok || !payload?.valid) {
          const errorMsg = payload?.error || 'Este convite não existe ou já foi utilizado.'
          throw new Error(errorMsg)
        }

        setInviteData(payload.invite)
        if (payload.invite?.email) {
          setFormData(prev => ({ ...prev, email: payload.invite.email }))
        }
      } catch (err: any) {
        setError(getErrorMessage(err))
      } finally {
        setValidating(false)
      }
    }

    validateToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          email: formData.email,
          password: formData.password,
          name: formData.name,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Erro ao aceitar convite (HTTP ${res.status})`)

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (signInError) throw signInError

      router.push('/dashboard')
    } catch (err: any) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const orgName: string = inviteData?.organization?.name || inviteData?.organizationName || ''
  const orgInviterName: string = inviteData?.invitedBy?.name || inviteData?.invitedByName || ''
  const orgMemberCount: number | undefined = inviteData?.organization?.memberCount
  const orgInitial = orgName ? orgName[0]?.toUpperCase() : 'a'

  if (validating) {
    return (
      <div className="auth">
        <section className="auth__panel" style={{ flex: 1, width: '100%' }}>
          <Loader2 className="animate-spin" size={28} aria-hidden="true" />
        </section>
      </div>
    )
  }

  if (error) {
    return (
      <div className="auth">
        <section className="auth__panel">
          <div className="auth__form">
            <div>
              <p className="eyebrow">entrar em organização</p>
              <h1 className="auth__title">convite inválido</h1>
              <p className="auth__text">{error}</p>
            </div>
            <button className="btn btn--ghost btn--lg btn--block" onClick={() => router.push('/login')}>
              voltar pro login
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="auth">
      <aside className="auth__aside">
        <Image className="logo" src="/brand/logo-aaagencia-white.png" alt="aaagência" width={140} height={34} unoptimized />
        <div>
          <p className="auth__claim">o pós-venda inteiro num lugar<span className="dot-lime">.</span></p>
          <p className="auth__sub">negociação, conversas dos três canais e um agente de IA que só te chama quando a decisão é sua.</p>
        </div>
        <p className="auth__signature">marketing · tráfego pago · inteligência artificial</p>
      </aside>
      <section className="auth__panel">
        <form className="auth__form" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">entrar em organização</p>
            <h1 className="auth__title">{orgName ? `você foi convidada pra ${orgName}` : 'aceitar convite'}</h1>
          </div>

          {orgName && (
            <div className="org-card">
              <span className="org-card__mark" aria-hidden="true">
                a<span className="lime">{orgInitial}</span>
              </span>
              <span className="channel-row__text">
                <span className="channel-row__name">{orgName}</span>
                <span className="channel-row__meta">
                  {orgMemberCount ? `${orgMemberCount} pessoas · ` : ''}
                  {orgInviterName ? `convidada por ${orgInviterName}` : 'convite recebido'}
                </span>
              </span>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="join-name">nome completo</label>
            <input
              className="input"
              id="join-name"
              type="text"
              required
              aria-required="true"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="join-email">e-mail</label>
            <input
              className="input"
              id="join-email"
              type="email"
              required
              aria-required="true"
              disabled={!!inviteData?.email}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="join-password">senha</label>
            <input
              className="input"
              id="join-password"
              type="password"
              required
              aria-required="true"
              minLength={6}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <p className="note-purple">
            seu acesso entra com o papel definido no convite — você pode ver isso e ajustar depois em configurações.
          </p>

          <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : 'criar conta e entrar na organização'}
          </button>
          <p className="auth__text">
            recebeu o convite por engano? <Link href="/login">voltar pro login</Link>
          </p>
        </form>
      </section>
    </div>
  )
}
