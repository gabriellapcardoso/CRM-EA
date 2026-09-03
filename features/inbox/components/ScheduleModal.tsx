import React, { useState, useEffect } from 'react';
import { X, Phone, Calendar, Clock, CheckCircle } from 'lucide-react';
import { dataLocalISOEmDias, hojeLocalISO } from '@/lib/utils/dataLocal';

export type ScheduleType = 'CALL' | 'MEETING' | 'TASK';

interface ScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: ScheduleData) => void;
    contactName?: string;
    initialType?: ScheduleType;
    initialTitle?: string;
    initialDescription?: string;
    initialDate?: string; // YYYY-MM-DD
    initialTime?: string; // HH:mm
}

export interface ScheduleData {
    type: ScheduleType;
    title: string;
    description: string;
    date: string;
    time: string;
}

const typeConfig = {
    CALL: { label: 'Ligação', icon: Phone, color: 'blue' },
    MEETING: { label: 'Reunião', icon: Calendar, color: 'purple' },
    TASK: { label: 'Tarefa', icon: Clock, color: 'orange' },
};

/**
 * Componente React `ScheduleModal`.
 *
 * @param {ScheduleModalProps} {
    isOpen,
    onClose,
    onSave,
    contactName = 'Contato',
    initialType = 'CALL',
    initialTitle,
    initialDescription,
    initialDate,
    initialTime,
} - Parâmetro `{
    isOpen,
    onClose,
    onSave,
    contactName = 'Contato',
    initialType = 'CALL',
    initialTitle,
    initialDescription,
    initialDate,
    initialTime,
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export function ScheduleModal({
    isOpen,
    onClose,
    onSave,
    contactName = 'Contato',
    initialType = 'CALL',
    initialTitle,
    initialDescription,
    initialDate,
    initialTime,
}: ScheduleModalProps) {
    const [type, setType] = useState<ScheduleType>(initialType);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('10:00');
    const [isSaving, setIsSaving] = useState(false);
    const [titleTouched, setTitleTouched] = useState(false);

    // Reset form when modal opens
    useEffect(() => {
        if (!isOpen) return;

        setTitleTouched(false);
        setType(initialType);

        const defaultTitle = typeConfig[initialType].label + ' com ' + contactName;
        setTitle(typeof initialTitle === 'string' && initialTitle.trim() ? initialTitle : defaultTitle);

        setDescription(typeof initialDescription === 'string' ? initialDescription : '');

        // Default to tomorrow (unless provided)
        if (typeof initialDate === 'string' && initialDate) {
            setDate(initialDate);
        } else {
            setDate(dataLocalISOEmDias(1));
        }

        setTime(typeof initialTime === 'string' && initialTime ? initialTime : '10:00');
    }, [isOpen, initialType, contactName, initialTitle, initialDescription, initialDate, initialTime]);

    // Update title when type changes
    useEffect(() => {
        if (!isOpen) return;
        if (titleTouched) return;
        // Se abriu com um título sugerido (ex.: IA) e ainda está no tipo inicial, não sobrescrever.
        if (typeof initialTitle === 'string' && initialTitle.trim() && type === initialType) return;

        setTitle(typeConfig[type].label + ' com ' + contactName);
    }, [isOpen, type, contactName, titleTouched, initialTitle, initialType]);

    const handleSave = async () => {
        if (!title.trim() || !date) return;

        setIsSaving(true);
        try {
            await onSave({
                type,
                title: title.trim(),
                description: description.trim(),
                date,
                time,
            });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const config = typeConfig[type];

    return (
        <div className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="panel relative w-full max-w-xl mx-4 max-h-[90vh] flex flex-col overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }}>
                {/* Header */}
                <div className="panel__head shrink-0">
                    <h2 className="title-md flex items-center gap-2">
                        <Calendar size={16} aria-hidden="true" />
                        Agendar Atividade
                    </h2>
                    <button
                        onClick={onClose}
                        className="btn btn--quiet"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>

                {/* Content */}
                <div className="panel__body overflow-y-auto">
                    {/* Type selector */}
                    <div>
                        <label className="field__label">Tipo</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(Object.keys(typeConfig) as ScheduleType[]).map((t) => {
                                const cfg = typeConfig[t];
                                const Icon = cfg.icon;
                                const isSelected = type === t;
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setType(t)}
                                        aria-pressed={isSelected}
                                        className={`chip${isSelected ? ' chip--active' : ''}`}
                                        style={{ flexDirection: 'column', padding: '10px 8px' }}
                                    >
                                        <Icon size={16} aria-hidden="true" />
                                        {cfg.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="field__label">Título</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => {
                                setTitleTouched(true);
                                setTitle(e.target.value);
                            }}
                            className="input"
                            placeholder="Ex: Ligar para João"
                        />
                    </div>

                    {/* Date and Time */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="field__label">Data</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                min={hojeLocalISO()}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="field__label">Horário</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="input"
                            />
                        </div>
                    </div>

                    {/* Quick time buttons */}
                    <div className="flex gap-2 flex-wrap">
                        {['Hoje', 'Amanhã', 'Próx. semana'].map((label, idx) => {
                            const dateStr = dataLocalISOEmDias(idx === 1 ? 1 : idx === 2 ? 7 : 0);
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => setDate(dateStr)}
                                    aria-pressed={date === dateStr}
                                    className={`chip${date === dateStr ? ' chip--active' : ''}`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="field__label">Descrição (opcional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="input input--textarea" style={{ resize: "vertical", minHeight: 120, maxHeight: "40vh" }}
                            placeholder="Notas adicionais..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 shrink-0" style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
                    <button
                        onClick={onClose}
                        className="btn btn--ghost" style={{ flex: 1 }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!title.trim() || !date || isSaving}
                        className="btn btn--primary" style={{ flex: 1 }}
                    >
                        {isSaving ? (
                            <span className="animate-spin">⏳</span>
                        ) : (
                            <CheckCircle size={16} />
                        )}
                        Agendar
                    </button>
                </div>
            </div>
        </div>
    );
}
