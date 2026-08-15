import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enviarPropostaWhatsapp } from '@/lib/messaging/send-proposta-whatsapp';

/**
 * T4 — botão manual "Enviar via WhatsApp" no deal cockpit. Mesma função
 * core do disparo automático (enviarPropostaWhatsapp), auth diferente:
 * sessão do usuário logado, não secret interno — quem aciona é uma pessoa
 * confirmando um envio, não um sistema.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const orgId: string | undefined =
    (user.app_metadata?.organization_id as string | undefined) ??
    (await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()
      .then(({ data }) => data?.organization_id as string | undefined));

  if (!orgId) {
    return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
  }

  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .select('id, proposal_link, contact_id, contacts(id, name, phone)')
    .eq('id', dealId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (dealError || !deal) {
    return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 });
  }

  if (!deal.proposal_link) {
    return NextResponse.json({ error: 'Este negócio ainda não tem link de proposta' }, { status: 400 });
  }

  const contact = deal.contacts as unknown as { id: string; name: string | null; phone: string | null } | null;
  if (!contact?.phone) {
    return NextResponse.json({ error: 'Contato sem telefone cadastrado' }, { status: 400 });
  }

  const resultado = await enviarPropostaWhatsapp({
    organizationId: orgId,
    phone: contact.phone,
    link: deal.proposal_link,
    contactId: contact.id,
    contactName: contact.name,
  });

  if (!resultado.ok) {
    const mensagem =
      resultado.motivo === 'sem_canal'
        ? 'Nenhum canal de WhatsApp conectado pra esta organização'
        : resultado.erro || 'Falha ao enviar mensagem';
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
