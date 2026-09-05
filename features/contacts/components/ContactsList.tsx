import React from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Globe, ArrowUpDown, ArrowUp, ArrowDown, GitMerge } from 'lucide-react';
import { Contact, Company, ContactSortableColumn } from '@/types';
import { StageBadge } from './ContactsStageTabs';
import { getInitials } from '@/features/boards/cardFormat';

// Performance: reuse Intl formatters (they are relatively expensive to instantiate).
const PT_BR_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR');
const PT_BR_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});
const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
});

export type ContactChannel = 'whatsapp' | 'email' | 'instagram';

export interface ContactDealsSummary {
    count: number;
    openValue: number;
}

/**
 * Formata uma data para exibição relativa (ex: "hoje 09:12", "ontem", "2 d").
 */
function formatRelativeTouch(dateString: string | undefined | null, now: Date): string {
    if (!dateString) return '---';

    const date = new Date(dateString);
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffTime = today.getTime() - dateDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `hoje ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    if (diffDays === 1) return 'ontem';
    if (diffDays > 1 && diffDays < 30) return `${diffDays} d`;

    return PT_BR_DATE_FORMATTER.format(date);
}

/** Props for sortable column header */
interface SortableHeaderProps {
    label: string;
    column: ContactSortableColumn;
    currentSort: ContactSortableColumn;
    sortOrder: 'asc' | 'desc';
    onSort: (column: ContactSortableColumn) => void;
}

/** Sortable column header component */
const SortableHeader: React.FC<SortableHeaderProps> = ({ label, column, currentSort, sortOrder, onSort }) => {
    const isActive = currentSort === column;

    return (
        <th scope="col">
            <button
                type="button"
                onClick={() => onSort(column)}
                className="flex items-center gap-1"
                style={{ font: 'inherit', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
                aria-label={`Ordenar por ${label}`}
            >
                {label}
                <span style={{ opacity: isActive ? 1 : 0.4 }}>
                    {isActive ? (
                        sortOrder === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                    ) : (
                        <ArrowUpDown size={11} />
                    )}
                </span>
            </button>
        </th>
    );
};

interface ContactsListProps {
    viewMode: 'people' | 'companies';
    filteredContacts: Contact[];
    filteredCompanies: Company[];
    contacts: Contact[]; // Needed for company view avatar grouping
    selectedIds: Set<string>;
    toggleSelect: (id: string) => void;
    toggleSelectAll: () => void;
    getCompanyName: (id: string | undefined | null) => string;
    updateContact: (id: string, data: Partial<Contact>) => void;
    convertContactToDeal: (id: string) => void;
    openEditModal: (contact: Contact) => void;
    setDeleteId: (id: string) => void;
    openEditCompanyModal?: (company: Company) => void;
    setDeleteCompanyId?: (id: string) => void;
    // Sorting props
    sortBy?: ContactSortableColumn;
    sortOrder?: 'asc' | 'desc';
    onSort?: (column: ContactSortableColumn) => void;
    // Duplicate detection
    duplicateContactIds?: Set<string>;
    // Empty state action
    onAddContact?: () => void;
    /** Clique na linha — hoje navega pro detalhe do contato (`/contacts/[id]`). */
    onSelectContact?: (contact: Contact) => void;
    channelByContactId?: Map<string, ContactChannel>;
    pendingContactIds?: Set<string>;
    dealsSummaryByContact?: Map<string, ContactDealsSummary>;
    /** Dono derivado dos deals do contato — o contato não tem dono no schema. */
    ownerByContactId?: Map<string, string>;
}

/**
 * Lista de contatos/empresas — tabela `.table-list` (redesign 2026-08).
 *
 * Seis colunas de dado: contato (com empresa e estágio na segunda linha), canal,
 * dono, último toque, deals, em aberto — mais a caixa de seleção e as ações.
 * Clicar na linha (fora dos controles) abre `/contacts/[contactId]`; a célula do
 * nome é um link de verdade, pra abrir em nova aba e pra leitor de tela.
 */
export const ContactsList: React.FC<ContactsListProps> = ({
    viewMode,
    filteredContacts,
    filteredCompanies,
    contacts,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    getCompanyName,
    updateContact,
    convertContactToDeal,
    openEditModal,
    setDeleteId,
    openEditCompanyModal,
    setDeleteCompanyId,
    sortBy = 'created_at',
    sortOrder = 'desc',
    onSort,
    duplicateContactIds,
    onSelectContact,
    channelByContactId,
    pendingContactIds,
    dealsSummaryByContact,
    ownerByContactId,
}) => {
    const activeListIds = viewMode === 'people'
        ? filteredContacts.map(c => c.id)
        : filteredCompanies.map(c => c.id);
    const allSelected = activeListIds.length > 0 && selectedIds.size === activeListIds.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < activeListIds.length;

    // Performance: compute "contacts by company" once (avoids N filters per company row).
    const contactsByCompanyId = React.useMemo(() => {
        const map = new Map<string, Contact[]>();
        for (const c of contacts) {
            const companyId = c.clientCompanyId;
            if (!companyId) continue;
            const list = map.get(companyId);
            if (list) list.push(c);
            else map.set(companyId, [c]);
        }
        return map;
    }, [contacts]);

    // Performance: avoid creating `new Date()` for each row.
    const now = React.useMemo(() => new Date(), []);

    if (viewMode === 'people') {
        return (
            <table className="table-list table-list--fit">
                <thead>
                    <tr>
                        <th scope="col" style={{ width: 32 }}>
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                                onChange={toggleSelectAll}
                                aria-label={allSelected ? 'Desmarcar todos os contatos' : 'Selecionar todos os contatos'}
                            />
                        </th>
                        {onSort ? (
                            <SortableHeader label="contato" column="name" currentSort={sortBy} sortOrder={sortOrder} onSort={onSort} />
                        ) : (
                            <th scope="col">contato</th>
                        )}
                        <th scope="col">canal</th>
                        <th scope="col">dono</th>
                        {onSort ? (
                            <SortableHeader label="último toque" column="updated_at" currentSort={sortBy} sortOrder={sortOrder} onSort={onSort} />
                        ) : (
                            <th scope="col">último toque</th>
                        )}
                        <th scope="col">deals</th>
                        <th scope="col" style={{ textAlign: 'right' }}>em aberto</th>
                        <th scope="col"><span className="sr-only">ações</span></th>
                    </tr>
                </thead>
                <tbody>
                    {filteredContacts.length === 0 ? (
                        <tr>
                            <td colSpan={8} style={{ height: 'auto' }}>
                                <div className="state-empty">
                                    <h3 className="state-empty__title">nenhum contato encontrado</h3>
                                    <p className="state-empty__text">tente ajustar os filtros ou adicione um novo contato.</p>
                                </div>
                            </td>
                        </tr>
                    ) : filteredContacts.map((contact) => {
                        const dealsSummary = dealsSummaryByContact?.get(contact.id);
                        const channel = channelByContactId?.get(contact.id);
                        const isPending = pendingContactIds?.has(contact.id) ?? false;
                        const owner = ownerByContactId?.get(contact.id) ?? null;

                        return (
                            <tr
                                key={contact.id}
                                onClick={() => onSelectContact?.(contact)}
                                style={{
                                    cursor: onSelectContact ? 'pointer' : undefined,
                                    background: selectedIds.has(contact.id) ? 'var(--purple-50)' : undefined,
                                }}
                            >
                                <td onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(contact.id)}
                                        onChange={() => toggleSelect(contact.id)}
                                        aria-label={`Selecionar ${contact.name}`}
                                    />
                                </td>
                                {/* `stopPropagation`: o <Link> abaixo já navega. Sem isto o
                                    onClick da linha dispara junto — e num cmd+clique o Link
                                    abre a aba nova enquanto a linha leva a aba atual junto.
                                    Mesmo padrão das células de seleção e de ações. */}
                                <td onClick={(e) => e.stopPropagation()}>
                                    {/* A empresa era coluna própria e, junto com "estágio",
                                        era o que empurrava a tabela além da largura da tela
                                        (o `min-width: 840px` do `.table-list`). Como segunda
                                        linha do nome ela continua legível e a lista para de
                                        rolar pro lado. O estágio vai junto, ao lado dela. */}
                                    <Link className="table-list__link" href={`/contacts/${contact.id}`}>
                                        <span className="avatar">{getInitials(contact.name)}</span>
                                        <span className="cell-name__stack">
                                            <span className="cell-name__top">
                                                <span className="cell-name__text">
                                                    {contact.name}
                                                    {duplicateContactIds?.has(contact.id) && (
                                                        <GitMerge size={11} style={{ display: 'inline', marginLeft: 5, verticalAlign: 'middle', color: 'var(--warning)' }} aria-label="Duplicado" />
                                                    )}
                                                </span>
                                                {isPending && <span className="flag-pending" title="tem pendência de IA" />}
                                            </span>
                                            <span className="cell-name__co">
                                                <span className="cell-name__co-text">
                                                    {getCompanyName(contact.clientCompanyId)}
                                                </span>
                                                <StageBadge stage={contact.stage} />
                                            </span>
                                        </span>
                                    </Link>
                                </td>
                                <td>
                                    {channel ? (
                                        <span
                                            className={`badge-channel badge-channel--${channel}`}
                                            title={channel === 'whatsapp' ? 'WhatsApp' : channel === 'instagram' ? 'Instagram' : 'E-mail'}
                                        >
                                            {channel === 'whatsapp' ? 'W' : channel === 'instagram' ? 'I' : 'E'}
                                        </span>
                                    ) : (
                                        <span className="muted">—</span>
                                    )}
                                </td>
                                {/* Contato não tem dono próprio no schema — o dono vem dos
                                    deals dele (ver `ownerByContactId` em ContactsPage). Sem
                                    deal, é "—", que é diferente de "sem dono". */}
                                <td className={owner ? 'muted' : 'cell-owner--none'}>{owner ?? '—'}</td>
                                <td className="muted" title={contact.updatedAt ? PT_BR_DATE_TIME_FORMATTER.format(new Date(contact.updatedAt)) : undefined}>
                                    {formatRelativeTouch(contact.updatedAt || contact.createdAt, now)}
                                </td>
                                <td className="muted">{dealsSummary?.count ? `${dealsSummary.count} deal${dealsSummary.count > 1 ? 's' : ''}` : '—'}</td>
                                <td className="cell-num num">
                                    {dealsSummary?.openValue ? CURRENCY_FORMATTER.format(dealsSummary.openValue) : '—'}
                                </td>
                                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => convertContactToDeal(contact.id)}
                                        className="btn btn--ghost"
                                        style={{ padding: '3px 6px' }}
                                        aria-label={`Criar oportunidade para ${contact.name}`}
                                    >
                                        <Plus size={13} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEditModal(contact)}
                                        className="btn btn--ghost"
                                        style={{ padding: '3px 6px' }}
                                        aria-label={`Editar ${contact.name}`}
                                    >
                                        <Pencil size={13} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeleteId(contact.id)}
                                        className="btn btn--ghost"
                                        style={{ padding: '3px 6px' }}
                                        aria-label={`Excluir ${contact.name}`}
                                    >
                                        <Trash2 size={13} aria-hidden="true" />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );
    }

    return (
        <table className="table-list table-list--fit">
            <thead>
                <tr>
                    <th scope="col" style={{ width: 32 }}>
                        <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = someSelected; }}
                            onChange={toggleSelectAll}
                            aria-label={allSelected ? 'Desmarcar todas as empresas' : 'Selecionar todas as empresas'}
                        />
                    </th>
                    <th scope="col">empresa</th>
                    <th scope="col">setor</th>
                    <th scope="col">criado em</th>
                    <th scope="col">pessoas vinc.</th>
                    <th scope="col"><span className="sr-only">ações</span></th>
                </tr>
            </thead>
            <tbody>
                {filteredCompanies.length === 0 ? (
                    <tr>
                        <td colSpan={6}>
                            <div className="state-empty">
                                <h3 className="state-empty__title">nenhuma empresa encontrada</h3>
                                <p className="state-empty__text">tente ajustar os filtros ou adicione uma nova empresa.</p>
                            </div>
                        </td>
                    </tr>
                ) : filteredCompanies.map((company) => {
                    const linkedContacts = contactsByCompanyId.get(company.id) ?? [];
                    return (
                        <tr key={company.id} style={{ background: selectedIds.has(company.id) ? 'var(--purple-50)' : undefined }}>
                            <td onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(company.id)}
                                    onChange={() => toggleSelect(company.id)}
                                    aria-label={`Selecionar ${company.name}`}
                                />
                            </td>
                            <td>
                                <span className="cell-name">
                                    <span className="avatar avatar--muted">{getInitials(company.name)}</span>
                                    <span className="cell-name__text">{company.name}</span>
                                </span>
                                {company.website && (
                                    <a href={`https://${company.website}`} target="_blank" rel="noopener noreferrer" className="meta" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                        <Globe size={10} /> {company.website}
                                    </a>
                                )}
                            </td>
                            <td className="muted">{company.industry || 'indefinido'}</td>
                            <td className="muted">{PT_BR_DATE_FORMATTER.format(new Date(company.createdAt))}</td>
                            <td className="muted">{linkedContacts.length > 0 ? `${linkedContacts.length} pessoa${linkedContacts.length > 1 ? 's' : ''}` : 'ninguém'}</td>
                            <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button
                                    type="button"
                                    onClick={() => openEditCompanyModal?.(company)}
                                    className="btn btn--ghost"
                                    style={{ padding: '3px 6px' }}
                                    aria-label={`Editar ${company.name}`}
                                >
                                    <Pencil size={13} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeleteCompanyId?.(company.id)}
                                    className="btn btn--ghost"
                                    style={{ padding: '3px 6px' }}
                                    aria-label={`Excluir ${company.name}`}
                                >
                                    <Trash2 size={13} aria-hidden="true" />
                                </button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
