'use client';

import React, { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WindowExpiryBadgeProps {
  windowExpiresAt: string | null | undefined;
  className?: string;
  variant?: 'inline' | 'badge';
}

function getExpiryInfo(expiresAt: string | null | undefined): {
  isExpired: boolean;
  minutesRemaining: number | null;
  hoursRemaining: number | null;
  status: 'expired' | 'critical' | 'warning' | 'ok';
} {
  if (!expiresAt) {
    return { isExpired: false, minutesRemaining: null, hoursRemaining: null, status: 'ok' };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { isExpired: true, minutesRemaining: 0, hoursRemaining: 0, status: 'expired' };
  }

  const minutesRemaining = Math.floor(diffMs / (1000 * 60));
  const hoursRemaining = Math.floor(minutesRemaining / 60);

  let status: 'expired' | 'critical' | 'warning' | 'ok';
  if (minutesRemaining <= 60) {
    status = 'critical';
  } else if (hoursRemaining <= 4) {
    status = 'warning';
  } else {
    status = 'ok';
  }

  return { isExpired: false, minutesRemaining, hoursRemaining, status };
}

/** Mapeia o status da janela pro vocabulário `.status-chip` do redesign. */
const STATUS_STYLES = {
  expired: { container: 'status-chip status-chip--off', icon: XCircle },
  critical: { container: 'status-chip status-chip--warn', icon: AlertTriangle },
  warning: { container: 'status-chip status-chip--warn', icon: Clock },
  ok: { container: 'status-chip status-chip--on', icon: Clock },
};

export const WindowExpiryBadge = memo(function WindowExpiryBadge({
  windowExpiresAt,
  className,
  variant = 'badge',
}: WindowExpiryBadgeProps) {
  // Tick counter forces useMemo to re-evaluate periodically so time display stays fresh
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!windowExpiresAt) return;
    // Update every 30s when showing minutes, every 60s otherwise
    const intervalMs = 30_000;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [windowExpiresAt]);

  const expiryInfo = useMemo(() => getExpiryInfo(windowExpiresAt), [windowExpiresAt, tick]);

  // Don't show if no expiry or more than 12 hours remaining
  if (!windowExpiresAt || (expiryInfo.hoursRemaining !== null && expiryInfo.hoursRemaining > 12)) {
    return null;
  }

  const { status, minutesRemaining, hoursRemaining, isExpired } = expiryInfo;
  const styles = STATUS_STYLES[status];
  const Icon = styles.icon;

  // Format display text
  let displayText: string;
  if (isExpired) {
    displayText = 'Janela expirada';
  } else if (minutesRemaining !== null && minutesRemaining <= 60) {
    displayText = `${minutesRemaining}min restantes`;
  } else if (hoursRemaining !== null) {
    displayText = `${hoursRemaining}h restantes`;
  } else {
    return null;
  }

  if (variant === 'inline') {
    return (
      <span
        className={cn('inline-flex items-center gap-1', className)}
        style={{
          fontSize: 11,
          fontWeight: 700,
          color:
            status === 'expired' ? 'var(--danger)'
              : status === 'critical' || status === 'warning' ? '#8a6200'
                : '#1c7a4a',
        }}
      >
        <Icon className="w-3 h-3" aria-hidden="true" />
        <span>{displayText}</span>
      </span>
    );
  }

  return (
    <span className={cn(styles.container, 'inline-flex items-center gap-1.5', className)}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      <span>{displayText}</span>
    </span>
  );
});

export default WindowExpiryBadge;
