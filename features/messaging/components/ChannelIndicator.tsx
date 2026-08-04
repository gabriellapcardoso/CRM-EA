'use client';

import React, { memo } from 'react';
import { MessageSquare, Instagram, Mail, Phone, Send, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChannelType } from '@/lib/messaging/types';

interface ChannelIndicatorProps {
  type: ChannelType;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

/**
 * Vocabulário do redesign: `.badge-channel` (quadradinho colorido com a inicial
 * do canal). O handoff só especifica WhatsApp/e-mail/Instagram; os demais canais
 * reais do app (sms/telegram/voz) reusam a mesma forma com cor via token inline.
 */
export const CHANNEL_CONFIG: Record<
  ChannelType,
  {
    /** Inicial exibida dentro do badge */
    letter: string;
    /** Modificador do handoff, quando existe */
    modifier?: 'whatsapp' | 'email' | 'instagram';
    /** Cor de fundo (só para canais sem modificador no handoff) */
    color?: string;
    /**
     * Ícone do canal. O `.badge-channel` do redesign usa a inicial, não o ícone,
     * mas telas fora do escopo do redesign (ex.: `Modals/ChannelSetupModal`)
     * ainda desenham o canal com ícone — por isso o campo continua aqui.
     */
    icon: React.FC<{ className?: string }>;
    label: string;
  }
> = {
  whatsapp: { letter: 'W', modifier: 'whatsapp', icon: MessageSquare, label: 'WhatsApp' },
  instagram: { letter: 'I', modifier: 'instagram', icon: Instagram, label: 'Instagram' },
  email: { letter: 'E', modifier: 'email', icon: Mail, label: 'E-mail' },
  sms: { letter: 'S', color: 'var(--ink-500)', icon: Phone, label: 'SMS' },
  telegram: { letter: 'T', color: 'var(--purple-500)', icon: Send, label: 'Telegram' },
  voice: { letter: 'V', color: 'var(--ink-700)', icon: Mic, label: 'Voz' },
};

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'badge-channel--sm',
  md: '',
  lg: 'badge-channel--lg',
};

export const ChannelIndicator = memo(function ChannelIndicator({
  type,
  size = 'md',
  showLabel = false,
  className,
}: ChannelIndicatorProps) {
  const config = CHANNEL_CONFIG[type] || CHANNEL_CONFIG.whatsapp;

  const badge = (
    <span
      className={cn(
        'badge-channel',
        config.modifier && `badge-channel--${config.modifier}`,
        SIZE_CLASS[size],
        !showLabel && className
      )}
      style={config.color ? { background: config.color } : undefined}
      title={config.label}
      aria-hidden={showLabel ? true : undefined}
      aria-label={showLabel ? undefined : config.label}
      role={showLabel ? undefined : 'img'}
    >
      {config.letter}
    </span>
  );

  if (!showLabel) return badge;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {badge}
      <span className="message__channel">{config.label}</span>
    </span>
  );
});

export default ChannelIndicator;
