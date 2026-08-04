import type { Metadata } from 'next'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister'
import { InstallBanner } from '@/components/pwa/InstallBanner'

export const metadata: Metadata = {
  title: 'NossoCRM',
  description: 'CRM Inteligente para Gestão de Vendas',
}

/**
 * Componente React `RootLayout`.
 *
 * @param {{ children: ReactNode; }} {
  children,
} - Parâmetro `{
  children,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning: necessário porque a classe "dark" pode ser adicionada no cliente (ThemeProvider)
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans antialiased bg-[var(--color-bg)] text-[var(--color-text-primary)]">
        <ServiceWorkerRegister />
        <InstallBanner />
        {children}
      </body>
    </html>
  )
}
