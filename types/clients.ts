/**
 * Módulo Clientes — governança de carteira pós-venda.
 *
 * A empresa (`crm_companies`) É o cliente. Estes tipos descrevem as colunas de
 * governança que ela ganhou e as tabelas satélite. Ver PLANO-CLIENTES.md §3.
 */

export type ClientNiche =
    | 'local'
    | 'ecommerce'
    | 'infoproduto'
    | 'servicos_digitais'
    | 'politico_mandato'
    | 'politico_eleitoral';

export type ClientLifecycleStage =
    | 'lead'
    | 'contrato_assinado'
    | 'kickoff'
    | 'setup_concluido'
    | 'em_operacao'
    | 'churn';

export type ClientCategory = 'ouro' | 'prata' | 'bronze';

/** Procedência do health score. Hoje só existe `manual`; ver PLANO-CLIENTES.md §7.2. */
export type HealthSource = 'manual' | 'nps';

export type ContractStatus = 'rascunho' | 'vigente' | 'encerrado';

export type DocumentType = 'cpf' | 'cnpj';

export type ClientAssetKind = 'documento' | 'foto_autorizada' | 'contrato' | 'gerado';

/** Faixa de saúde. Rótulo de leitura, nunca cor de decisão — lima é só HITL. */
export type HealthBand = 'promotor' | 'satisfeito' | 'neutro' | 'detrator' | 'churn';

export interface ClientContract {
    id: string;
    companyId: string;
    monthlyValue: number;
    startsAt: string;
    endsAt?: string;
    renewalDate?: string;
    status: ContractStatus;
    paymentMethod?: string;
    scope: string[];
    documentType?: DocumentType;
    /** Só dígitos. Formatação é responsabilidade da tela. */
    documentNumber?: string;
    addressZip?: string;
    addressStreet?: string;
    addressNumber?: string;
    addressComplement?: string;
    addressDistrict?: string;
    addressCity?: string;
    addressState?: string;
    signedAssetId?: string;
    notes?: string;
    ownerId?: string;
    organizationId?: string;
    createdAt: string;
    updatedAt?: string;
}

/** Empresa com a camada de governança e o contrato vigente já resolvido. */
export interface ClientView {
    id: string;
    organizationId?: string;
    name: string;
    industry?: string;
    website?: string;
    ownerId?: string;

    isClient: boolean;
    clientSince?: string;
    niche?: ClientNiche;
    lifecycleStage?: ClientLifecycleStage;
    category?: ClientCategory;
    healthScore?: number;
    healthSource: HealthSource;

    /** Contrato `vigente` da empresa, quando existe. Um só, por índice único parcial. */
    activeContract?: ClientContract;

    createdAt: string;
    updatedAt?: string;
}

export interface ClientsFilters {
    search?: string;
    status?: 'todos' | 'ativo' | 'arquivado';
    band?: HealthBand | 'todos';
    category?: ClientCategory | 'todos';
    renewal?: 'todos' | 'proximos_30' | 'proximos_60' | 'atrasada';
    stage?: ClientLifecycleStage | 'todos';
}

export type ClientsSort = 'nome' | 'mrr' | 'renovacao' | 'saude';

export interface ClientsMetrics {
    /** Soma dos contratos vigentes. */
    receitaMensal: number;
    clientesAtivos: number;
    /** LTV realizado médio: valor mensal × meses decorridos desde o início. */
    ltvMedio: number;
    /** Contratos vigentes com renovação nos próximos 90 dias. */
    alertasRenovacao: number;
    /**
     * Clientes ativos SEM contrato cadastrado. Eles entram como zero em toda
     * soma acima — o painel diz quantos são em vez de deixar a omissão passar
     * por resultado.
     */
    semContrato: number;
}

// =============================================================================
// F2 — ficha do cliente
// =============================================================================

/** Marco escrito à mão. O que é derivável NÃO vira linha aqui. */
export interface ClientEvent {
    id: string;
    companyId: string;
    title: string;
    body?: string;
    occurredAt: string;
    actorId?: string;
    organizationId?: string;
    createdAt: string;
}

export interface ClientTeamMember {
    id: string;
    companyId: string;
    profileId: string;
    /** Nome do perfil, resolvido na leitura. */
    profileName: string;
    role?: string;
    createdAt: string;
}

/** De onde a linha da timeline veio. A tela mostra isso: origem importa. */
export type TimelineOrigem = 'atividade' | 'marco';

export interface ClientTimelineItem {
    id: string;
    origem: TimelineOrigem;
    /** ISO. Ordena decrescente. */
    ocorridoEm: string;
    titulo: string;
    detalhe?: string;
    /** Tipo da atividade (CALL, NOTE, STATUS_CHANGE...), quando origem é atividade. */
    tipo?: string;
    /** Título do deal a que a atividade pertence, quando houver. */
    deal?: string;
    autor?: string;
}
