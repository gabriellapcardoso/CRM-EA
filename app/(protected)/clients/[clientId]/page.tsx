import type { Metadata } from 'next';
import ClientDetailPage from '@/features/clients/detail/ClientDetailPage';

/**
 * Ficha do cliente. URL: /clients/[clientId] — o id é o da empresa
 * (`crm_companies`), que É o cliente.
 */
export const metadata: Metadata = { title: 'Cliente | NossoCRM' };

export default async function ClientePage({
    params,
}: {
    params: Promise<{ clientId: string }>;
}) {
    const { clientId } = await params;
    return <ClientDetailPage companyId={clientId} />;
}
