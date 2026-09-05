import type { Metadata } from 'next';
import ContactDetailPage from '@/features/contacts/detail/ContactDetailPage';

/**
 * Detalhe do contato em tela cheia — substitui a gaveta de 340px da lista.
 * URL: /contacts/[contactId]
 */
export const metadata: Metadata = { title: 'Contato | NossoCRM' };

export default async function ContatoPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  return <ContactDetailPage contactId={contactId} />;
}
