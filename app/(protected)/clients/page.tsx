import type { Metadata } from 'next';
import { ClientsPage } from '@/features/clients/ClientsPage';

export const metadata: Metadata = { title: 'Clientes | NossoCRM' };

export default function Clients() {
    return <ClientsPage />;
}
