'use client'

import React, { useState } from 'react';
import { useActivitiesController } from './hooks/useActivitiesController';
import { ActivitiesHeader } from './components/ActivitiesHeader';
import { ActivitiesFilters } from './components/ActivitiesFilters';
import { ActivitiesList } from './components/ActivitiesList';
import { ActivitiesCalendar } from './components/ActivitiesCalendar';
import { ActivityFormModal } from './components/ActivityFormModal';
import { BulkActionsToolbar } from './components/BulkActionsToolbar';
import { useToast } from '@/context/ToastContext';

/**
 * Componente React `ActivitiesPage`.
 *
 * Redesenhado em 2026-08 (ver REDESIGN-CRM.md) a partir de `atividades(+carregando).html`:
 * timeline agrupada por dia (`.timeline__group`/`.timeline__day` sticky). Página "padded"
 * — raiz em `screen__inner screen__inner--wide`, como as demais telas dessa categoria.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesPage: React.FC = () => {
    const {
        viewMode,
        setViewMode,
        searchTerm,
        setSearchTerm,
        filterType,
        setFilterType,
        dateFilter,
        currentDate,
        setCurrentDate,
        isModalOpen,
        setIsModalOpen,
        editingActivity,
        formData,
        setFormData,
        filteredActivities,
        deals,
        contacts,
        companies,
        isLoading,
        isError,
        refetchActivities,
        handleNewActivity,
        handleEditActivity,
        handleDeleteActivity,
        handleToggleComplete,
        handleSubmit
    } = useActivitiesController();

    const { addToast } = useToast();
    const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set());

    const handleSelectActivity = (id: string, selected: boolean) => {
        setSelectedActivities(prev => {
            const newSet = new Set(prev);
            if (selected) {
                newSet.add(id);
            } else {
                newSet.delete(id);
            }
            return newSet;
        });
    };

    const handleClearSelection = () => {
        setSelectedActivities(new Set());
    };

    const handleCompleteAll = () => {
        selectedActivities.forEach(id => {
            handleToggleComplete(id);
        });
        addToast(`${selectedActivities.size} atividades concluídas!`, 'success');
        handleClearSelection();
    };

    const handleSnoozeAll = () => {
        // In a real app, this would update the date of each activity
        addToast(`${selectedActivities.size} atividades adiadas para amanhã!`, 'success');
        handleClearSelection();
    };

    return (
        <div className="screen__inner screen__inner--wide">
            <ActivitiesHeader
                viewMode={viewMode}
                setViewMode={setViewMode}
                onNewActivity={handleNewActivity}
                dateFilter={dateFilter}
            />

            {viewMode === 'list' ? (
                <>
                    <ActivitiesFilters
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        filterType={filterType}
                        setFilterType={setFilterType}
                    />

                    {isError && (
                        <p className="banner banner--error">
                            <span className="dot" />
                            <span className="banner__text">
                                <strong className="banner__title">o histórico não carregou por completo.</strong>{' '}
                                mostrando o que está em cache. a sincronização volta sozinha em instantes.
                            </span>
                            <span className="spacer" />
                            <button type="button" onClick={() => refetchActivities()} className="btn btn--ghost">
                                recarregar
                            </button>
                        </p>
                    )}

                    {isLoading ? (
                        <div className="skeleton-stack">
                            <span className="skeleton skeleton--card" />
                            <span className="skeleton skeleton--card" />
                            <span className="skeleton skeleton--card" />
                            <span className="skeleton skeleton--card" />
                        </div>
                    ) : (
                        <ActivitiesList
                            activities={filteredActivities}
                            deals={deals}
                            contacts={contacts}
                            companies={companies}
                            onToggleComplete={handleToggleComplete}
                            onEdit={handleEditActivity}
                            onDelete={handleDeleteActivity}
                            selectedActivities={selectedActivities}
                            onSelectActivity={handleSelectActivity}
                            onAddActivity={handleNewActivity}
                        />
                    )}
                </>
            ) : (
                <ActivitiesCalendar
                    activities={filteredActivities}
                    deals={deals}
                    currentDate={currentDate}
                    setCurrentDate={setCurrentDate}
                />
            )}

            <ActivityFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                formData={formData}
                setFormData={setFormData}
                editingActivity={editingActivity}
                deals={deals}
            />

            <BulkActionsToolbar
                selectedCount={selectedActivities.size}
                onCompleteAll={handleCompleteAll}
                onSnoozeAll={handleSnoozeAll}
                onClearSelection={handleClearSelection}
            />
        </div>
    );
};
