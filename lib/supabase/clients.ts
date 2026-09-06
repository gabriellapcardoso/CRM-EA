/**
 * @fileoverview Serviço Supabase do Módulo Clientes.
 *
 * A empresa (`crm_companies`) É o cliente — as colunas de governança moram
 * nela. `client_contracts` é 1:N com vigência, e o índice único parcial
 * `idx_client_contracts_um_vigente` garante que o join abaixo não multiplique
 * a linha (e o MRR) sem ninguém perceber.
 *
 * Toda leitura filtra `deleted_at` explicitamente. O isolamento por
 * organização aqui é do RLS: este é o cliente do navegador, onde a sessão do
 * usuário sempre passa pela policy. O filtro explícito de `organization_id`
 * que o CLAUDE.md exige vale pro caminho de service role (IA e ferramentas),
 * que ignora RLS — se alguma rota do módulo passar por lá, ela filtra.
 */

import { supabase } from './client';
import { sanitizePostgrestValue } from '@/lib/utils/sanitize';
import type {
    ClientView,
    ClientContract,
    ContractStatus,
    DocumentType,
    ClientNiche,
    ClientLifecycleStage,
    ClientCategory,
    HealthSource,
} from '@/types/clients';

type DbContract = {
    id: string;
    company_id: string;
    monthly_value: number | string;
    starts_at: string;
    ends_at: string | null;
    renewal_date: string | null;
    status: ContractStatus;
    payment_method: string | null;
    scope: string[] | null;
    document_type: DocumentType | null;
    document_number: string | null;
    address_zip: string | null;
    address_street: string | null;
    address_number: string | null;
    address_complement: string | null;
    address_district: string | null;
    address_city: string | null;
    address_state: string | null;
    signed_asset_id: string | null;
    notes: string | null;
    deleted_at: string | null;
    owner_id: string | null;
    organization_id: string;
    created_at: string;
    updated_at: string | null;
};

type DbClientCompany = {
    id: string;
    organization_id: string;
    name: string;
    industry: string | null;
    website: string | null;
    owner_id: string | null;
    is_client: boolean;
    client_since: string | null;
    niche: ClientNiche | null;
    lifecycle_stage: ClientLifecycleStage | null;
    category: ClientCategory | null;
    health_score: number | null;
    health_source: HealthSource;
    created_at: string;
    updated_at: string | null;
    client_contracts?: DbContract[] | null;
};

export function transformContract(db: DbContract): ClientContract {
    return {
        id: db.id,
        companyId: db.company_id,
        monthlyValue: Number(db.monthly_value ?? 0),
        startsAt: db.starts_at,
        endsAt: db.ends_at ?? undefined,
        renewalDate: db.renewal_date ?? undefined,
        status: db.status,
        paymentMethod: db.payment_method ?? undefined,
        scope: db.scope ?? [],
        documentType: db.document_type ?? undefined,
        documentNumber: db.document_number ?? undefined,
        addressZip: db.address_zip ?? undefined,
        addressStreet: db.address_street ?? undefined,
        addressNumber: db.address_number ?? undefined,
        addressComplement: db.address_complement ?? undefined,
        addressDistrict: db.address_district ?? undefined,
        addressCity: db.address_city ?? undefined,
        addressState: db.address_state ?? undefined,
        signedAssetId: db.signed_asset_id ?? undefined,
        notes: db.notes ?? undefined,
        ownerId: db.owner_id ?? undefined,
        organizationId: db.organization_id,
        createdAt: db.created_at,
        updatedAt: db.updated_at ?? undefined,
    };
}

function transformClient(db: DbClientCompany): ClientView {
    // O embed traz TODOS os contratos da empresa; a seleção do vigente é
    // aqui, não no PostgREST. Filtro em tabela embutida tem semântica
    // diferente conforme o join seja `!left` ou `!inner` — resolver em
    // TypeScript custa nada e não depende dessa sutileza. Vigente é um só:
    // garantido pelo índice único parcial `idx_client_contracts_um_vigente`,
    // não pela boa vontade da query.
    const vigente = (db.client_contracts ?? []).find(
        c => c.status === 'vigente' && !c.deleted_at,
    );
    return {
        id: db.id,
        organizationId: db.organization_id,
        name: db.name,
        industry: db.industry ?? undefined,
        website: db.website ?? undefined,
        ownerId: db.owner_id ?? undefined,
        isClient: db.is_client,
        clientSince: db.client_since ?? undefined,
        niche: db.niche ?? undefined,
        lifecycleStage: db.lifecycle_stage ?? undefined,
        category: db.category ?? undefined,
        healthScore: db.health_score ?? undefined,
        healthSource: db.health_source ?? 'manual',
        activeContract: vigente ? transformContract(vigente) : undefined,
        createdAt: db.created_at,
        updatedAt: db.updated_at ?? undefined,
    };
}

const SELECT_CLIENTE = `
    id, organization_id, name, industry, website, owner_id,
    is_client, client_since, niche, lifecycle_stage, category,
    health_score, health_source, created_at, updated_at,
    client_contracts!left(*)
`;

export interface ClientsPage {
    data: ClientView[];
    total: number;
}

export const clientsService = {
    /**
     * Página da carteira. A busca por nome é server-side; os demais filtros
     * são client-side na F1 porque dependem de faixa derivada (saúde) e de
     * janela de data relativa (renovação), e o volume da carteira de uma
     * agência cabe numa página. Vira server-side quando passar de mil.
     */
    async listar(
        params: { page: number; pageSize: number; search?: string },
        options?: { signal?: AbortSignal },
    ): Promise<{ data: ClientsPage | null; error: Error | null }> {
        try {
            if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

            const desde = params.page * params.pageSize;
            const ate = desde + params.pageSize - 1;

            let query = supabase
                .from('crm_companies')
                .select(SELECT_CLIENTE, { count: 'exact' })
                .eq('is_client', true)
                .is('deleted_at', null)
                .order('name', { ascending: true })
                .range(desde, ate);

            const busca = params.search?.trim();
            if (busca) {
                query = query.ilike('name', `%${sanitizePostgrestValue(busca)}%`);
            }
            if (options?.signal) query = query.abortSignal(options.signal);

            const { data, error, count } = await query;
            if (error) return { data: null, error };

            return {
                data: {
                    data: (data ?? []).map(c => transformClient(c as unknown as DbClientCompany)),
                    total: count ?? 0,
                },
                error: null,
            };
        } catch (e) {
            return { data: null, error: e as Error };
        }
    },

    /** Um cliente pelo id da empresa. */
    async obter(
        companyId: string,
        options?: { signal?: AbortSignal },
    ): Promise<{ data: ClientView | null; error: Error | null }> {
        try {
            if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

            let query = supabase
                .from('crm_companies')
                .select(SELECT_CLIENTE)
                .eq('id', companyId)
                .is('deleted_at', null);
            if (options?.signal) query = query.abortSignal(options.signal);

            const { data, error } = await query.maybeSingle();
            if (error) return { data: null, error };
            if (!data) return { data: null, error: null };

            return { data: transformClient(data as unknown as DbClientCompany), error: null };
        } catch (e) {
            return { data: null, error: e as Error };
        }
    },

    /**
     * Promove uma empresa a cliente, ou cria a empresa e já a promove.
     * `organization_id` é preenchido por trigger, como nas demais tabelas.
     */
    async criar(entrada: {
        name: string;
        niche?: ClientNiche;
        website?: string;
        industry?: string;
        lifecycleStage?: ClientLifecycleStage;
        category?: ClientCategory;
        healthScore?: number;
        companyId?: string;
    }): Promise<{ data: ClientView | null; error: Error | null }> {
        try {
            if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

            const campos = {
                name: entrada.name,
                niche: entrada.niche ?? null,
                website: entrada.website ?? null,
                industry: entrada.industry ?? null,
                lifecycle_stage: entrada.lifecycleStage ?? 'lead',
                category: entrada.category ?? null,
                health_score: entrada.healthScore ?? null,
                health_source: 'manual' as const,
                is_client: true,
                client_since: new Date().toISOString().slice(0, 10),
            };

            const query = entrada.companyId
                ? supabase.from('crm_companies').update(campos).eq('id', entrada.companyId)
                : supabase.from('crm_companies').insert(campos);

            const { data, error } = await query.select(SELECT_CLIENTE).single();
            if (error) return { data: null, error };

            return { data: transformClient(data as unknown as DbClientCompany), error: null };
        } catch (e) {
            return { data: null, error: e as Error };
        }
    },

    async atualizar(
        companyId: string,
        campos: Partial<{
            name: string;
            niche: ClientNiche | null;
            website: string | null;
            industry: string | null;
            lifecycleStage: ClientLifecycleStage;
            category: ClientCategory | null;
            healthScore: number | null;
            isClient: boolean;
        }>,
    ): Promise<{ data: ClientView | null; error: Error | null }> {
        try {
            if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

            const db: Record<string, unknown> = {};
            if (campos.name !== undefined) db.name = campos.name;
            if (campos.niche !== undefined) db.niche = campos.niche;
            if (campos.website !== undefined) db.website = campos.website;
            if (campos.industry !== undefined) db.industry = campos.industry;
            if (campos.lifecycleStage !== undefined) db.lifecycle_stage = campos.lifecycleStage;
            if (campos.category !== undefined) db.category = campos.category;
            if (campos.healthScore !== undefined) db.health_score = campos.healthScore;
            if (campos.isClient !== undefined) db.is_client = campos.isClient;
            db.updated_at = new Date().toISOString();

            const { data, error } = await supabase
                .from('crm_companies')
                .update(db)
                .eq('id', companyId)
                .is('deleted_at', null)
                .select(SELECT_CLIENTE)
                .single();
            if (error) return { data: null, error };

            return { data: transformClient(data as unknown as DbClientCompany), error: null };
        } catch (e) {
            return { data: null, error: e as Error };
        }
    },
};

export const clientContractsService = {
    /** Todos os contratos da empresa, do mais recente pro mais antigo. */
    async listarPorEmpresa(
        companyId: string,
        options?: { signal?: AbortSignal },
    ): Promise<{ data: ClientContract[] | null; error: Error | null }> {
        try {
            if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

            let query = supabase
                .from('client_contracts')
                .select('*')
                .eq('company_id', companyId)
                .is('deleted_at', null)
                .order('starts_at', { ascending: false });
            if (options?.signal) query = query.abortSignal(options.signal);

            const { data, error } = await query;
            if (error) return { data: null, error };
            return { data: (data ?? []).map(c => transformContract(c as DbContract)), error: null };
        } catch (e) {
            return { data: null, error: e as Error };
        }
    },

    async salvar(
        entrada: Partial<ClientContract> & { companyId: string; startsAt: string },
    ): Promise<{ data: ClientContract | null; error: Error | null }> {
        try {
            if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

            const db: Record<string, unknown> = {
                company_id: entrada.companyId,
                monthly_value: entrada.monthlyValue ?? 0,
                starts_at: entrada.startsAt,
                ends_at: entrada.endsAt ?? null,
                renewal_date: entrada.renewalDate ?? null,
                status: entrada.status ?? 'rascunho',
                payment_method: entrada.paymentMethod ?? null,
                scope: entrada.scope ?? [],
                document_type: entrada.documentType ?? null,
                document_number: entrada.documentNumber ?? null,
                address_zip: entrada.addressZip ?? null,
                address_street: entrada.addressStreet ?? null,
                address_number: entrada.addressNumber ?? null,
                address_complement: entrada.addressComplement ?? null,
                address_district: entrada.addressDistrict ?? null,
                address_city: entrada.addressCity ?? null,
                address_state: entrada.addressState ?? null,
                notes: entrada.notes ?? null,
            };

            const query = entrada.id
                ? supabase.from('client_contracts')
                    .update({ ...db, updated_at: new Date().toISOString() })
                    .eq('id', entrada.id)
                : supabase.from('client_contracts').insert(db);

            const { data, error } = await query.select('*').single();
            if (error) return { data: null, error };
            return { data: transformContract(data as DbContract), error: null };
        } catch (e) {
            return { data: null, error: e as Error };
        }
    },
};
