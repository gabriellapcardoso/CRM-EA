/**
 * @fileoverview Serviço Supabase para contact_product_interests — interesses
 * de um contato num produto do catálogo local, registrados antes dele virar
 * deal. RLS org-scoped + trigger cross-tenant garantem isolamento; a
 * conversão pra deal (snapshot em deal_items) acontece via RPC
 * `convert_contact_to_deal` (ver lib/supabase/contacts.ts).
 */

import { supabase } from './client';
import { ContactProductInterest } from '@/types';
import { sanitizeUUID } from './utils';

type DbContactProductInterest = {
  id: string;
  contact_id: string;
  product_id: string;
  observacao: string | null;
  converted_at: string | null;
  converted_deal_id: string | null;
  created_at: string;
  products: { name: string; price: number } | null;
};

function transform(db: DbContactProductInterest): ContactProductInterest {
  return {
    id: db.id,
    contactId: db.contact_id,
    productId: db.product_id,
    productName: db.products?.name ?? '',
    productPrice: Number(db.products?.price ?? 0),
    observacao: db.observacao || undefined,
    convertedAt: db.converted_at || undefined,
    convertedDealId: db.converted_deal_id || undefined,
    createdAt: db.created_at,
  };
}

export const contactProductInterestsService = {
  async listByContact(contactId: string): Promise<{ data: ContactProductInterest[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };

      const { data, error } = await supabase
        .from('contact_product_interests')
        .select('id, contact_id, product_id, observacao, converted_at, converted_deal_id, created_at, products(name, price)')
        .eq('contact_id', sanitizeUUID(contactId))
        .order('created_at', { ascending: false });

      if (error) return { data: [], error };

      const rows = (data || []) as unknown as DbContactProductInterest[];
      return { data: rows.map(transform), error: null };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  async create(
    contactId: string,
    productId: string,
    observacao?: string
  ): Promise<{ data: ContactProductInterest | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .maybeSingle();

      const organizationId = sanitizeUUID((profile as any)?.organization_id);
      if (!organizationId) {
        return { data: null, error: new Error('Organização não identificada. Recarregue a página e tente novamente.') };
      }

      const { data, error } = await supabase
        .from('contact_product_interests')
        .insert({
          contact_id: sanitizeUUID(contactId),
          product_id: sanitizeUUID(productId),
          observacao: observacao || null,
          organization_id: organizationId,
        })
        .select('id, contact_id, product_id, observacao, converted_at, converted_deal_id, created_at, products(name, price)')
        .single();

      if (error) {
        if (error.code === '23505') {
          return {
            data: null,
            error: new Error('Este contato já tem um interesse pendente nesse produto.'),
          };
        }
        return { data: null, error };
      }

      return { data: transform(data as unknown as DbContactProductInterest), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async remove(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      const { error } = await supabase
        .from('contact_product_interests')
        .delete()
        .eq('id', sanitizeUUID(id));

      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },
};
