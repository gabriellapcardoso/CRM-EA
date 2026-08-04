import React, { useState, useEffect } from 'react';
import { X, Phone, PhoneOff, Check, XCircle, Voicemail, Clock, FileText, Copy, ExternalLink } from 'lucide-react';
import { normalizePhoneE164 } from '@/lib/phone';

interface CallModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: CallLogData) => void;
    contactName: string;
    contactPhone: string;
    suggestedTitle?: string;
}

export interface CallLogData {
    outcome: 'connected' | 'no_answer' | 'voicemail' | 'busy';
    duration: number; // in seconds
    notes: string;
    title: string;
}

/**
 * Componente React `CallModal`.
 *
 * @param {CallModalProps} {
    isOpen,
    onClose,
    onSave,
    contactName,
    contactPhone,
    suggestedTitle = 'Ligação'
} - Parâmetro `{
    isOpen,
    onClose,
    onSave,
    contactName,
    contactPhone,
    suggestedTitle = 'Ligação'
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const CallModal: React.FC<CallModalProps> = ({
    isOpen,
    onClose,
    onSave,
    contactName,
    contactPhone,
    suggestedTitle = 'Ligação'
}) => {
    const [openedAt, setOpenedAt] = useState<Date | null>(null);
    const [dialerOpenedAt, setDialerOpenedAt] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [outcome, setOutcome] = useState<CallLogData['outcome'] | null>(null);
    const [notes, setNotes] = useState('');
    const [title, setTitle] = useState(suggestedTitle);
    const [copied, setCopied] = useState(false);

    const phone = normalizePhoneE164(contactPhone);

    // Reset state when opening the modal (so it behaves like a fresh log each time).
    useEffect(() => {
        if (!isOpen) return;

        setOpenedAt(new Date());
        setDialerOpenedAt(null);
        setElapsedTime(0);
        setOutcome(null);
        setNotes('');
        setTitle(suggestedTitle);
        setCopied(false);
    }, [isOpen, suggestedTitle]);

    // Timer effect: without WebRTC we don't know call lifecycle, so we start counting only
    // after the user explicitly opens the OS dialer.
    useEffect(() => {
        if (!isOpen) return;
        if (!dialerOpenedAt) return;

        const interval = setInterval(() => {
            setElapsedTime(Math.floor((new Date().getTime() - dialerOpenedAt.getTime()) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [isOpen, dialerOpenedAt]);

    // Format time as MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSave = () => {
        if (!outcome) return;

        onSave({
            outcome,
            duration: elapsedTime,
            notes,
            title
        });
        onClose();
    };

    const handleDiscard = () => {
        onClose();
    };

    const handleCopyPhone = async () => {
        if (!phone) return;
        try {
            await navigator.clipboard.writeText(phone);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            // ignore
        }
    };

    const handleOpenPhoneApp = () => {
        if (!phone) return;
        if (!dialerOpenedAt) {
            setDialerOpenedAt(new Date());
        }
        // Explicit user action: open the OS dialer/app.
        window.open(`tel:${phone}`, '_self');
    };

    if (!isOpen) return null;

    const outcomeOptions = [
        { id: 'connected', label: 'Atendeu', icon: Check },
        { id: 'no_answer', label: 'Não atendeu', icon: XCircle },
        { id: 'voicemail', label: 'Caixa postal', icon: Voicemail },
        { id: 'busy', label: 'Ocupado', icon: PhoneOff },
    ] as const;

    return (
        <div className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0" style={{ background: 'rgba(20,10,35,.45)' }} onClick={handleDiscard} />

            {/* Modal */}
            <div
                className="panel relative w-full max-w-xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"
                style={{ boxShadow: 'var(--shadow-lg)' }}
            >
                {/* Header */}
                <div className="panel__head shrink-0">
                    <span className="actor actor--humano" aria-hidden="true">
                        <Phone size={13} />
                    </span>
                    <div className="min-w-0">
                        <h3 className="title-sm">{contactName}</h3>
                        <span className="flex items-center gap-1">
                            <span className="meta num">{phone || ''}</span>
                            {phone && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleCopyPhone}
                                        className="btn btn--quiet"
                                        title={copied ? 'Copiado' : 'Copiar número'}
                                        aria-label={copied ? 'Copiado' : 'Copiar número'}
                                    >
                                        <Copy size={12} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenPhoneApp}
                                        className="btn btn--quiet"
                                        title="Abrir no discador"
                                        aria-label="Abrir no discador"
                                    >
                                        <ExternalLink size={12} aria-hidden="true" />
                                    </button>
                                </>
                            )}
                        </span>
                    </div>
                    <span className="spacer" />
                    <button onClick={handleDiscard} className="btn btn--quiet" aria-label="Fechar">
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>

                {/* Timer */}
                <div className="banner banner--info shrink-0" style={{ justifyContent: 'center' }}>
                    <Clock size={16} aria-hidden="true" />
                    <span className="confidence__value num">
                        {formatTime(dialerOpenedAt ? elapsedTime : 0)}
                    </span>
                    <span className="banner__text">
                        {!phone ? (
                            'Sem número de telefone para discar.'
                        ) : dialerOpenedAt ? (
                            'Tempo desde abrir o discador (a chamada acontece fora do CRM).'
                        ) : (
                            'Abra o discador para iniciar a contagem.'
                        )}
                    </span>
                </div>

                {/* Content */}
                <div className="panel__body overflow-y-auto">
                    {/* Outcome Selection */}
                    <div className="field">
                        <span className="field__label">resultado da ligação</span>
                        <div className="chip-row">
                            {outcomeOptions.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setOutcome(id)}
                                    aria-pressed={outcome === id}
                                    className={`chip${outcome === id ? ' chip--active' : ''}`}
                                >
                                    <Icon size={13} aria-hidden="true" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div className="field">
                        <label className="field__label" htmlFor="call-title">título da atividade</label>
                        <input
                            id="call-title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="input"
                            placeholder="Ex: Ligação de follow-up"
                        />
                    </div>

                    {/* Notes */}
                    <div className="field">
                        <label className="field__label flex items-center gap-2" htmlFor="call-notes">
                            <FileText size={12} aria-hidden="true" />
                            notas da ligação
                        </label>
                        <textarea
                            id="call-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="O que foi discutido? Próximos passos?"
                            className="input input--textarea"
                            style={{ minHeight: 140, maxHeight: '40vh', resize: 'vertical' }}
                            rows={6}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div
                    className="flex flex-col sm:flex-row gap-2 shrink-0"
                    style={{ paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}
                >
                    <button onClick={handleDiscard} className="btn btn--quiet" style={{ flex: 1 }}>
                        Descartar
                    </button>
                    <button
                        type="button"
                        onClick={handleCopyPhone}
                        disabled={!phone}
                        className="btn btn--ghost"
                        style={{ flex: 1 }}
                        title={copied ? 'Copiado' : 'Copiar número'}
                    >
                        <Copy size={14} aria-hidden="true" />
                        {copied ? 'Copiado' : 'Copiar número'}
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenPhoneApp}
                        disabled={!phone}
                        className="btn btn--on-lime"
                        style={{ flex: 1 }}
                        title="Abrir no discador"
                    >
                        <ExternalLink size={14} aria-hidden="true" />
                        Abrir no discador
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!outcome}
                        className="btn btn--primary"
                        style={{ flex: 1 }}
                    >
                        <Check size={14} aria-hidden="true" />
                        Salvar Log
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CallModal;
