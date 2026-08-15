import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

/**
 * Kill switch (T4) e e-mail de alerta do health-check da sessão Evolution.
 * Ver T4-EXECUCAO.md item 4.
 */

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

const UpdateWhatsAppSafetySchema = z
  .object({
    killSwitchActive: z.boolean().optional(),
    alertEmail: z.string().nullable().optional(),
    autoSendProposalWhatsapp: z.boolean().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  const { data: orgSettings, error: orgError } = await supabase
    .from('organization_settings')
    .select('whatsapp_kill_switch_active, alert_email, auto_send_proposal_whatsapp')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (orgError) {
    return json({ error: orgError.message }, 500);
  }

  return json({
    killSwitchActive: Boolean(orgSettings?.whatsapp_kill_switch_active),
    alertEmail: orgSettings?.alert_email ?? null,
    autoSendProposalWhatsapp: Boolean(orgSettings?.auto_send_proposal_whatsapp),
  });
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = UpdateWhatsAppSafetySchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const updates = parsed.data;

  const trimmedEmail = updates.alertEmail?.trim() || null;
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return json({ error: 'E-mail de alerta inválido' }, 400);
  }

  const dbUpdates: Record<string, unknown> = {
    organization_id: profile.organization_id,
    updated_at: new Date().toISOString(),
  };

  if (updates.killSwitchActive !== undefined) {
    dbUpdates.whatsapp_kill_switch_active = updates.killSwitchActive;
  }
  if (updates.alertEmail !== undefined) {
    dbUpdates.alert_email = trimmedEmail;
  }
  if (updates.autoSendProposalWhatsapp !== undefined) {
    dbUpdates.auto_send_proposal_whatsapp = updates.autoSendProposalWhatsapp;
  }

  const { error: upsertError } = await supabase
    .from('organization_settings')
    .upsert(dbUpdates, { onConflict: 'organization_id' });

  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({ ok: true });
}
