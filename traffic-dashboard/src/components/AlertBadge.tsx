// src/components/AlertBadge.tsx
'use client';

import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { AlertEvent } from '@/types';

interface Props { alert: AlertEvent }

const severityConfig = {
  HIGH:   { color: 'border-red-500/40 bg-red-500/10',       badge: 'bg-red-500/20 text-red-400 ring-red-500/40',       icon: '🔴' },
  MEDIUM: { color: 'border-orange-500/40 bg-orange-500/10', badge: 'bg-orange-500/20 text-orange-400 ring-orange-500/40', icon: '🟠' },
  LOW:    { color: 'border-yellow-500/40 bg-yellow-500/10', badge: 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/40', icon: '🟡' },
};

function formatRelative(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

export function AlertBadge({ alert }: Props) {
  const cfg = severityConfig[alert.severity];
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={clsx(
        'rounded-xl border p-4 transition-all',
        cfg.color
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={clsx('text-xs font-semibold rounded-full px-2 py-0.5 ring-1', cfg.badge)}>
              {alert.severity}
            </span>
            <span className="text-xs font-mono text-slate-500">{alert.roadId}</span>
          </div>
          <p className="text-sm text-slate-300 leading-snug">{alert.message}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
          <time className="text-xs text-slate-600 whitespace-nowrap">
            {new Date(alert.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </time>
          <span className="text-xs text-slate-700 whitespace-nowrap">
            {formatRelative(alert.triggeredAt)}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
