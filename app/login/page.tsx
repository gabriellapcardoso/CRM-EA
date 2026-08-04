'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getErrorMessage } from '@/lib/utils/errorUtils'
import { Loader2 } from 'lucide-react'

/**
 * Componente React `LoginPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            if (!supabase) {
                throw new Error('Supabase não configurado. Configure as variáveis de ambiente.')
            }

            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) throw error
            router.push('/dashboard')
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
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
                        <h1 className="auth__title">bem-vinda de volta</h1>
                        <p className="auth__text">entre pra ver o que rolou enquanto você não estava.</p>
                    </div>
                    <div className="field">
                        <label className="field__label" htmlFor="email-address">e-mail</label>
                        <input
                            className="input"
                            id="email-address"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            aria-required="true"
                            aria-describedby={error ? 'login-error' : undefined}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="field">
                        <label className="field__label" htmlFor="password">senha</label>
                        <input
                            className={`input${error ? ' input--error' : ''}`}
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            aria-required="true"
                            aria-describedby={error ? 'login-error' : undefined}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <p className="banner banner--error" id="login-error" role="alert" aria-live="polite">
                            <span className="banner__text"><strong>{error}</strong></span>
                        </p>
                    )}

                    <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={16} /> : 'entrar'}
                    </button>
                    <p className="auth__divider">ou</p>
                    <Link className="btn btn--ghost btn--lg btn--block" href="/join">criar organização</Link>
                </form>
            </section>
        </div>
    )
}
