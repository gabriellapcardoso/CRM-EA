'use client'

import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useContactsController } from './hooks/useContactsController';
import { ContactsHeader } from './components/ContactsHeader';
import { ContactsFilters } from './components/ContactsFilters';
import { ContactsTabs } from './components/ContactsTabs';
import { ContactsStageTabs } from './components/ContactsStageTabs';
import { ContactsList, type ContactChannel, type ContactDealsSummary } from './components/ContactsList';
import { PaginationControls } from './components/PaginationControls';
import { DuplicatesBanner } from './components/DuplicatesBanner';
import {
    useDuplicateContactsQuery,
    useMergeContactsMutation,
    useDealsView,
    usePendingAdvancesQuery,
    useMessagingConversations,
} from '@/lib/query/hooks';
import { ConfirmDialog as ConfirmModal } from '@/components/ui/confirm-dialog';
import type { DealView } from '@/types';

const ContactFormModal = dynamic(
    () => import('./components/ContactFormModal').then(m => ({ default: m.ContactFormModal })),
    { ssr: false }
);
const CompanyFormModal = dynamic(
    () => import('./components/CompanyFormModal').then(m => ({ default: m.CompanyFormModal })),
    { ssr: false }
);
const SelectBoardModal = dynamic(
    () => import('./components/SelectBoardModal').then(m => ({ default: m.SelectBoardModal })),
    { ssr: false }
);
const ContactsImportExportModal = dynamic(
    () => import('./components/ContactsImportExportModal').then(m => ({ default: m.ContactsImportExportModal })),
    { ssr: false }
);
const MergeContactsModal = dynamic(
    () => import('./components/MergeContactsModal').then(m => ({ default: m.MergeContactsModal })),
    { ssr: false }
);


/**
 * Componente React `ContactsPage`.
 *
 * Redesenhado em 2026-08 (ver REDESIGN-CRM.md) a partir de `contatos(+estados).html`.
 * A gaveta de detalhe (`.detail-pane`, 340px) saiu na revisão de 2026-09-04: clicar
 * numa linha agora navega pra `/contacts/[contactId]`, tela cheia — o detalhe deixa
 * de roubar largura da lista e passa a ter URL própria, que dá pra recarregar e
 * mandar pra alguém. Ver `features/contacts/detail/ContactDetailPage.tsx`.
 *
 * Desvio deliberado da convenção "página padded" (`screen__inner`): a tela usa
 * `.screen--split` direto sob `.screen`, sem wrapper, porque a tabela precisa
 * herdar 100% da altura disponível — nesting sob `screen__inner` (que não tem
 * altura própria) quebraria o scroll interno dela.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ContactsPage: React.FC = () => {
    const controller = useContactsController();
    const router = useRouter();
    const [isImportExportOpen, setIsImportExportOpen] = React.useState(false);
    const [isMergeModalOpen, setIsMergeModalOpen] = React.useState(false);

    const { data: duplicateGroups = [] } = useDuplicateContactsQuery();
    const mergeMutation = useMergeContactsMutation();

    // Dados reais pro painel de detalhe: deals do contato, pendência de IA e canal de contato.
    const { data: dealsView = [] } = useDealsView();
    const { data: pendingAdvances = [] } = usePendingAdvancesQuery({ status: 'pending' });
    const { data: conversations = [] } = useMessagingConversations();

    const duplicateContactIds = React.useMemo(() => {
        const ids = new Set<string>();
        for (const group of duplicateGroups) {
            for (const id of group.contact_ids) ids.add(id);
        }
        return ids;
    }, [duplicateGroups]);

    const dealsByContactId = React.useMemo(() => {
        const map = new Map<string, DealView[]>();
        for (const deal of dealsView) {
            if (!deal.contactId) continue;
            const list = map.get(deal.contactId);
            if (list) list.push(deal);
            else map.set(deal.contactId, [deal]);
        }
        return map;
    }, [dealsView]);

    const dealsSummaryByContact = React.useMemo(() => {
        const map = new Map<string, ContactDealsSummary>();
        for (const [contactId, deals] of dealsByContactId) {
            let openValue = 0;
            for (const deal of deals) {
                if (!deal.isWon && !deal.isLost) openValue += deal.value || 0;
            }
            map.set(contactId, { count: deals.length, openValue });
        }
        return map;
    }, [dealsByContactId]);

    /**
     * Dono do contato — derivado dos deals dele, porque `contacts` não tem coluna
     * de dono. Pega o primeiro deal com dono definido; contato sem deal fica sem
     * dono, e a tabela mostra "—" (ausência de dado, não "ninguém é dono").
     */
    const ownerByContactId = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const [contactId, contactDeals] of dealsByContactId) {
            const withOwner = contactDeals.find(d => d.owner?.name);
            if (withOwner?.owner?.name) map.set(contactId, withOwner.owner.name);
        }
        return map;
    }, [dealsByContactId]);

    const pendingContactIds = React.useMemo(() => {
        const dealIdToContactId = new Map<string, string>();
        for (const deal of dealsView) {
            if (deal.contactId) dealIdToContactId.set(deal.id, deal.contactId);
        }
        const ids = new Set<string>();
        for (const advance of pendingAdvances) {
            const contactId = dealIdToContactId.get(advance.deal_id);
            if (contactId) ids.add(contactId);
        }
        return ids;
    }, [dealsView, pendingAdvances]);

    const channelByContactId = React.useMemo(() => {
        const map = new Map<string, ContactChannel>();
        for (const conv of conversations) {
            if (!conv.contactId || map.has(conv.contactId)) continue;
            const type = conv.channelType;
            if (type === 'whatsapp' || type === 'instagram' || type === 'email') {
                map.set(conv.contactId, type);
            }
        }
        return map;
    }, [conversations]);

    const goToDeal = (dealId: string) => {
        controller.setDeleteWithDeals(null);
        router.push(`/boards?deal=${dealId}`);
    };

    /**
     * Clicar num contato abre a tela cheia dele. Antes selecionava a gaveta de
     * 340px ao lado, e o estado morria no `useState`: recarregar a página ou
     * mandar o link pra alguém devolvia a lista sem contato nenhum aberto.
     */
    const abrirContato = (contactId: string) => {
        router.push(`/contacts/${contactId}`);
    };

    return (
        <div className="screen--split">
            <div className="list-pane">
                <div className="list-toolbar">
                    <ContactsTabs
                        viewMode={controller.viewMode}
                        setViewMode={controller.setViewMode}
                        contactsCount={controller.totalCount}
                        companiesCount={controller.companies.length}
                    />
                    <ContactsHeader
                        viewMode={controller.viewMode}
                        search={controller.search}
                        setSearch={controller.setSearch}
                        statusFilter={controller.statusFilter}
                        setStatusFilter={controller.setStatusFilter}
                        isFilterOpen={controller.isFilterOpen}
                        setIsFilterOpen={controller.setIsFilterOpen}
                        openCreateModal={controller.openCreateModal}
                        openImportExportModal={() => setIsImportExportOpen(true)}
                    />
                </div>

                {controller.viewMode === 'people' && (
                    <div className="list-toolbar">
                        <ContactsStageTabs
                            activeStage={controller.stageFilter}
                            onStageChange={controller.setStageFilter}
                            counts={controller.stageCounts}
                        />
                    </div>
                )}

                {controller.isFilterOpen && (
                    <div style={{ padding: '0 var(--space-5)' }}>
                        <ContactsFilters dateRange={controller.dateRange} setDateRange={controller.setDateRange} />
                    </div>
                )}

                {duplicateGroups.length > 0 && (
                    <div style={{ padding: '0 var(--space-5)' }}>
                        <DuplicatesBanner count={duplicateGroups.length} onResolve={() => setIsMergeModalOpen(true)} />
                    </div>
                )}

                {controller.selectedIds.size > 0 && (
                    <p className="banner banner--info banner--inset">
                        <span className="banner__text">
                            {controller.selectedIds.size} {controller.viewMode === 'people' ? 'contato(s)' : 'empresa(s)'} selecionado(s)
                        </span>
                        <button type="button" onClick={controller.clearSelection} className="btn btn--quiet">
                            limpar seleção
                        </button>
                        <span className="spacer" />
                        <button type="button" onClick={() => controller.setBulkDeleteConfirm(true)} className="btn btn--danger">
                            <Trash2 size={14} /> excluir selecionados
                        </button>
                    </p>
                )}

                {controller.isError && (
                    <p className="banner banner--error banner--inset">
                        <span className="dot" />
                        <span className="banner__text">
                            <strong className="banner__title">a lista não carregou por completo.</strong>{' '}
                            mostrando os contatos em cache. a sincronização volta sozinha em instantes.
                        </span>
                        <span className="spacer" />
                        <button type="button" onClick={() => controller.refetchContacts()} className="btn btn--ghost">
                            recarregar
                        </button>
                    </p>
                )}

                <div className="table-list__scroll">
                    {controller.isLoading ? (
                        <div className="skeleton-stack">
                            <span className="skeleton skeleton--row" />
                            <span className="skeleton skeleton--row" />
                            <span className="skeleton skeleton--row" />
                            <span className="skeleton skeleton--row" />
                        </div>
                    ) : (
                        <ContactsList
                            viewMode={controller.viewMode}
                            filteredContacts={controller.filteredContacts}
                            filteredCompanies={controller.filteredCompanies}
                            contacts={controller.contacts}
                            selectedIds={controller.selectedIds}
                            toggleSelect={controller.toggleSelect}
                            toggleSelectAll={controller.toggleSelectAll}
                            getCompanyName={controller.getCompanyName}
                            updateContact={controller.updateContact}
                            convertContactToDeal={controller.convertContactToDeal}
                            openEditModal={controller.openEditModal}
                            setDeleteId={controller.setDeleteId}
                            openEditCompanyModal={controller.openEditCompanyModal}
                            setDeleteCompanyId={controller.setDeleteCompanyId}
                            sortBy={controller.sortBy}
                            sortOrder={controller.sortOrder}
                            onSort={controller.handleSort}
                            duplicateContactIds={duplicateContactIds}
                            onAddContact={controller.openCreateModal}
                            onSelectContact={(contact) => abrirContato(contact.id)}
                            channelByContactId={channelByContactId}
                            pendingContactIds={pendingContactIds}
                            dealsSummaryByContact={dealsSummaryByContact}
                            ownerByContactId={ownerByContactId}
                        />
                    )}
                </div>

                {controller.viewMode === 'people' && controller.totalCount > 0 && (
                    <div style={{ padding: '0 var(--space-5) var(--space-4)' }}>
                        <PaginationControls
                            pagination={controller.pagination}
                            setPagination={controller.setPagination}
                            totalCount={controller.totalCount}
                            isFetching={controller.isFetching}
                            isPlaceholderData={controller.isPlaceholderData}
                        />
                    </div>
                )}
            </div>

            <ContactsImportExportModal
                isOpen={isImportExportOpen}
                onClose={() => setIsImportExportOpen(false)}
                exportParams={{
                    search: controller.search?.trim() ? controller.search.trim() : undefined,
                    stage: controller.stageFilter,
                    status: controller.statusFilter,
                    dateStart: controller.dateRange?.start || undefined,
                    dateEnd: controller.dateRange?.end || undefined,
                    sortBy: controller.sortBy,
                    sortOrder: controller.sortOrder,
                }}
            />

            <ContactFormModal
                isOpen={controller.isModalOpen}
                onClose={() => controller.setIsModalOpen(false)}
                onSubmit={controller.handleSubmit}
                formData={controller.formData}
                setFormData={controller.setFormData}
                editingContact={controller.editingContact}
                createFakeContactsBatch={controller.createFakeContactsBatch}
                isSubmitting={controller.isSubmittingContact}
            />

            <CompanyFormModal
                isOpen={controller.isCompanyModalOpen}
                onClose={() => controller.setIsCompanyModalOpen(false)}
                onSubmit={controller.handleCompanySubmit}
                editingCompany={controller.editingCompany}
            />

            <SelectBoardModal
                isOpen={!!controller.createDealContactId}
                onClose={() => controller.setCreateDealContactId(null)}
                onSelect={controller.createDealForContact}
                boards={controller.boards}
                contactName={controller.contactForDeal?.name || ''}
            />

            <ConfirmModal
                isOpen={!!controller.deleteId}
                onClose={() => controller.setDeleteId(null)}
                onConfirm={controller.confirmDelete}
                title="Excluir Contato"
                message="Tem certeza que deseja excluir este contato? Esta ação não pode ser desfeita."
                confirmText="Excluir"
                variant="danger"
            />

            <ConfirmModal
                isOpen={!!controller.deleteCompanyId}
                onClose={() => controller.setDeleteCompanyId(null)}
                onConfirm={controller.confirmDeleteCompany}
                title="Excluir Empresa"
                message="Tem certeza que deseja excluir esta empresa? Esta ação não pode ser desfeita."
                confirmText="Excluir"
                variant="danger"
            />

            {/* Modal for contacts with deals */}
            <ConfirmModal
                isOpen={!!controller.deleteWithDeals}
                onClose={() => controller.setDeleteWithDeals(null)}
                onConfirm={controller.confirmDeleteWithDeals}
                title="Contato com Negócios"
                message={
                    <div className="space-y-3">
                        <p>Este contato possui {controller.deleteWithDeals?.dealCount || 0} negócio(s) vinculado(s):</p>
                        <ul className="text-left bg-slate-100 dark:bg-slate-800/50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                            {controller.deleteWithDeals?.deals.map((deal) => (
                                <li key={deal.id} className="text-sm">
                                    <button
                                        onClick={() => goToDeal(deal.id)}
                                        className="text-primary-600 dark:text-primary-400 hover:underline font-medium text-left"
                                    >
                                        • {deal.title}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <p className="text-red-500 dark:text-red-400 font-medium">Ao excluir, todos os negócios também serão excluídos.</p>
                    </div>
                }
                confirmText="Excluir Tudo"
                variant="danger"
            />

            {/* Modal for bulk delete */}
            <ConfirmModal
                isOpen={controller.bulkDeleteConfirm}
                onClose={() => controller.setBulkDeleteConfirm(false)}
                onConfirm={controller.confirmBulkDelete}
                title={controller.viewMode === 'people' ? 'Excluir Contatos em Massa' : 'Excluir Empresas em Massa'}
                message={
                    <div className="space-y-2">
                        <p>
                            Tem certeza que deseja excluir <strong>{controller.selectedIds.size}</strong>{' '}
                            {controller.viewMode === 'people' ? 'contato(s)' : 'empresa(s)'}?
                        </p>
                        {controller.viewMode === 'people' ? (
                            <p className="text-red-500 dark:text-red-400 text-sm">
                                Todos os negócios vinculados também serão excluídos. Esta ação não pode ser desfeita.
                            </p>
                        ) : (
                            <p className="text-red-500 dark:text-red-400 text-sm">
                                Contatos/negócios vinculados serão desvinculados da empresa antes da exclusão. Esta ação não pode ser desfeita.
                            </p>
                        )}
                    </div>
                }
                confirmText={`Excluir ${controller.selectedIds.size} ${controller.viewMode === 'people' ? 'contato(s)' : 'empresa(s)'}`}
                variant="danger"
            />

            <MergeContactsModal
                isOpen={isMergeModalOpen}
                onClose={() => setIsMergeModalOpen(false)}
                groups={duplicateGroups}
                contacts={controller.contacts}
                onMerge={(sourceId, targetId) => mergeMutation.mutateAsync({ sourceId, targetId })}
            />
        </div>
    );
};
