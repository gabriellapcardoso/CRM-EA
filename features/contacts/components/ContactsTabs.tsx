import React from 'react';

interface ContactsTabsProps {
    viewMode: 'people' | 'companies';
    setViewMode: (mode: 'people' | 'companies') => void;
    contactsCount: number;
    companiesCount: number;
}

/**
 * Componente React `ContactsTabs`.
 *
 * @param {ContactsTabsProps} {
    viewMode,
    setViewMode,
    contactsCount,
    companiesCount
} - Parâmetro `{
    viewMode,
    setViewMode,
    contactsCount,
    companiesCount
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ContactsTabs: React.FC<ContactsTabsProps> = ({
    viewMode,
    setViewMode,
    contactsCount,
    companiesCount
}) => {
    return (
        <div className="chip-row">
            <button
                type="button"
                onClick={() => setViewMode('people')}
                className={`chip ${viewMode === 'people' ? 'chip--active' : ''}`}
            >
                pessoas · {contactsCount}
            </button>
            <button
                type="button"
                onClick={() => setViewMode('companies')}
                className={`chip ${viewMode === 'companies' ? 'chip--active' : ''}`}
            >
                empresas · {companiesCount}
            </button>
        </div>
    );
};
