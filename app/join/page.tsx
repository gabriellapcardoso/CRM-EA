import { Suspense } from 'react'
import { JoinClient } from './JoinClient'

/**
 * Componente React `JoinPage`.
 *
 * @param {{ searchParams?: { token?: string | string[] | undefined; } | undefined; }} {
  searchParams,
} - Parâmetro `{
  searchParams,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string | string[] }>
}) {
  const params = await searchParams
  const token =
    typeof params?.token === 'string'
      ? params.token
      : Array.isArray(params?.token)
        ? params?.token?.[0] ?? null
        : null

  return (
    <Suspense fallback={
      <div className="auth">
        <section className="auth__panel" style={{ flex: 1, width: '100%' }}>
          <span className="spinner" aria-hidden="true" />
        </section>
      </div>
    }>
      <JoinClient token={token} />
    </Suspense>
  )
}
