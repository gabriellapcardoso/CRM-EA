import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { enviarPropostaWhatsapp } from '@/lib/messaging/send-proposta-whatsapp';

/**
 * T4 — chamado pela Edge Function webhook-in (Deno) quando um deal entra em
 * "proposta-enviada" com auto_send_proposal_whatsapp ligado pra org. Deno
 * não pode importar ChannelRouterService (código Next.js/Node) direto —
 * esta rota é o hop HTTP interno que resolve isso.
 *
 * Auth: secret compartilhado, não sessão de usuário (chamador é um sistema,
 * não uma pessoa) — mesmo padrão X-Webhook-Secret dos webhooks externos.
 */
function secretValido(recebido: string | null, esperado: string | undefined): boolean {
  if (!recebido || !esperado) return false;
  const bufRecebido = Buffer.from(recebido);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecebido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecebido, bufEsperado);
}

export async function POST(request: NextRequest) {
  const secretRecebido = request.headers.get('X-Internal-Secret');
  const secretEsperado = process.env.CRM_EA_INTERNAL_WEBHOOK_SECRET;

  if (!secretValido(secretRecebido, secretEsperado)) {
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 });
  }

  let body: { organization_id?: string; deal_id?: string; phone?: string; link?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 422 });
  }

  const { organization_id: organizationId, deal_id: dealId, phone, link } = body;
  if (!organizationId || !dealId || !phone || !link) {
    return NextResponse.json({ error: 'organization_id, deal_id, phone e link são obrigatórios' }, { status: 422 });
  }

  // Achado do /review (2026-08-15): sem isso, deal_id chegava e nunca era
  // usado — a conversa criada pelo caminho automático ficava órfã
  // (contact_id null), diferente do botão manual, que linka certinho.
  // Buscar o deal também serve de defesa em profundidade contra o
  // organization_id do payload não bater com o dono real do deal (o secret
  // interno é compartilhado entre orgs, então essa checagem evita que um
  // payload malformado/adulterado envie em nome de uma org errada).
  const supabase = createStaticAdminClient();
  const { data: deal, error: dealErr } = await supabase
    .from('deals')
    .select('id, contact_id, organization_id, contacts(id, name)')
    .eq('id', dealId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (dealErr || !deal) {
    console.error('[auto-whatsapp-proposta] deal não encontrado pra essa org:', dealId, organizationId);
    return NextResponse.json({ ok: true, motivo: 'deal_nao_encontrado' });
  }

  const contact = deal.contacts as unknown as { id: string; name: string | null } | null;

  const resultado = await enviarPropostaWhatsapp({
    organizationId,
    phone,
    link,
    contactId: contact?.id ?? null,
    contactName: contact?.name ?? null,
  });

  if (!resultado.ok) {
    console.error('[auto-whatsapp-proposta] falha ao enviar:', resultado.motivo, resultado.erro);
    // 200 mesmo em falha — best-effort, não é um erro de payload/auth, e o
    // dispatcher/webhook-in que chamou isto não deveria reprocessar (T4:
    // decisão "loga, não retenta").
    return NextResponse.json({ ok: true, motivo: resultado.motivo });
  }

  return NextResponse.json({ ok: true });
}
