/**
 * Script Editor Modal
 * CRUD interface for user custom scripts
 */
import React, { useState, useEffect } from 'react';
import { X, Save, Sparkles, Eye, MessageSquare, AlertCircle, Target, RefreshCw } from 'lucide-react';
import type { ScriptCategory } from '@/lib/supabase/quickScripts';

interface ScriptEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (script: ScriptFormData) => Promise<void>;
    initialData?: ScriptFormData | null;
    previewVariables?: Record<string, string>;
}

export interface ScriptFormData {
    id?: string;
    title: string;
    category: ScriptCategory;
    template: string;
    icon: string;
}

const CATEGORIES: { value: ScriptCategory; label: string; color: string }[] = [
    { value: 'followup', label: 'Follow-up', color: 'blue' },
    { value: 'objection', label: 'Objeções', color: 'orange' },
    { value: 'closing', label: 'Fechamento', color: 'green' },
    { value: 'intro', label: 'Apresentação', color: 'purple' },
    { value: 'rescue', label: 'Resgate', color: 'yellow' },
    { value: 'other', label: 'Outros', color: 'slate' },
];

const ICONS = [
    { value: 'MessageSquare', icon: MessageSquare, label: 'Mensagem' },
    { value: 'AlertCircle', icon: AlertCircle, label: 'Alerta' },
    { value: 'Target', icon: Target, label: 'Alvo' },
    { value: 'Sparkles', icon: Sparkles, label: 'Brilho' },
    { value: 'RefreshCw', icon: RefreshCw, label: 'Refresh' },
];

/**
 * Componente React `ScriptEditorModal`.
 *
 * @param {ScriptEditorModalProps} {
    isOpen,
    onClose,
    onSave,
    initialData,
    previewVariables = { nome: 'Cliente', empresa: 'Empresa' }
} - Parâmetro `{
    isOpen,
    onClose,
    onSave,
    initialData,
    previewVariables = { nome: 'Cliente', empresa: 'Empresa' }
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export function ScriptEditorModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    previewVariables = { nome: 'Cliente', empresa: 'Empresa' }
}: ScriptEditorModalProps) {
    const [formData, setFormData] = useState<ScriptFormData>({
        title: '',
        category: 'other',
        template: '',
        icon: 'MessageSquare',
    });
    const [showPreview, setShowPreview] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                title: '',
                category: 'other',
                template: '',
                icon: 'MessageSquare',
            });
        }
    }, [initialData, isOpen]);

    const handleSave = async () => {
        if (!formData.title.trim() || !formData.template.trim()) return;

        setIsSaving(true);
        try {
            await onSave(formData);
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    const applyVariables = (template: string): string => {
        let result = template;
        for (const [key, value] of Object.entries(previewVariables)) {
            result = result.replaceAll(`{${key}}`, value);
        }
        return result;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="panel relative w-full max-w-2xl mx-4 overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }}>
                {/* Header */}
                <div className="panel__head">
                    <h2 className="title-md">
                        {initialData?.id ? 'Editar Script' : 'Novo Script'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="btn btn--quiet"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                    {/* Title */}
                    <div>
                        <label className="field__label">
                            Título do Script
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Ex: Follow-up de Proposta"
                            className="input"
                        />
                    </div>

                    {/* Category & Icon Row */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Category */}
                        <div>
                            <label className="field__label">
                                Categoria
                            </label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value as ScriptCategory })}
                                className="input"
                            >
                                {CATEGORIES.map((cat) => (
                                    <option key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Icon */}
                        <div>
                            <label className="field__label">
                                Ícone
                            </label>
                            <div className="flex gap-2">
                                {ICONS.map((iconOption) => {
                                    const IconComponent = iconOption.icon;
                                    return (
                                        <button
                                            key={iconOption.value}
                                            onClick={() => setFormData({ ...formData, icon: iconOption.value })}
                                            className={`chip${formData.icon === iconOption.value ? " chip--active" : ""}`}
                                            title={iconOption.label}
                                        >
                                            <IconComponent size={18} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Template */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="field__label">
                                Mensagem Template
                            </label>
                            <button
                                onClick={() => setShowPreview(!showPreview)}
                                className={`chip${showPreview ? " chip--active" : ""}`}
                            >
                                <Eye size={12} />
                                Preview
                            </button>
                        </div>

                        {!showPreview ? (
                            <textarea
                                value={formData.template}
                                onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                                placeholder="Olá {nome}! 👋&#10;&#10;Escreva sua mensagem aqui...&#10;&#10;Use {nome} e {empresa} como variáveis."
                                rows={8}
                                className="input input--textarea" style={{ resize: "none", fontFamily: "var(--font-mono)", minHeight: 200 }}
                            />
                        ) : (
                            <div className="input input--textarea" style={{ minHeight: 200, whiteSpace: "pre-wrap" }}>
                                {applyVariables(formData.template) ||
                                    <span className="text-slate-500 italic">Nenhum texto para preview...</span>
                                }
                            </div>
                        )}

                        <p className="text-[10px] text-slate-600 mt-2">
                            💡 Variáveis disponíveis: {'{nome}'}, {'{empresa}'}, {'{valor}'}, {'{produto}'}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3" style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
                    <button
                        onClick={onClose}
                        className="btn btn--quiet"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!formData.title.trim() || !formData.template.trim() || isSaving}
                        className="btn btn--primary"
                    >
                        <Save size={16} />
                        {isSaving ? 'Salvando...' : 'Salvar Script'}
                    </button>
                </div>
            </div>
        </div>
    );
}
