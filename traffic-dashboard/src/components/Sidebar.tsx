// src/components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Map,
  BarChart3,
  Trophy,
  Bell,
  TrafficCone,
  Activity,
  Brain,
  AlertTriangle,
} from 'lucide-react';
import { fetcher } from '@/lib/api';
import type { AlertEvent, AnomalyRecord } from '@/types';

// ── badge helpers ─────────────────────────────────────────────────────────────

const LS_ALERTS    = 'nav_alerts_seen_at';
const LS_ANOMALIES = 'nav_anomalies_seen_at';

function getSeenAt(key: string): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(key) ?? '0', 10);
}

function markSeen(key: string) {
  if (typeof window !== 'undefined') localStorage.setItem(key, Date.now().toString());
}

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className={clsx(
      'ml-auto shrink-0 flex items-center justify-center',
      'min-w-[18px] h-[18px] px-1 rounded-full',
      'text-[10px] font-bold leading-none',
      'bg-red-500 text-white',
    )}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

// ── nav items ─────────────────────────────────────────────────────────────────

const navItems = [
  { href: '/',            label: 'Dashboard',   icon: LayoutDashboard, badge: null as 'alerts' | 'anomalies' | null },
  { href: '/pulse',       label: 'City Pulse',  icon: Activity,        badge: null },
  { href: '/map',         label: 'Live Map',    icon: Map,             badge: null },
  { href: '/analytics',   label: 'Analytics',   icon: BarChart3,       badge: null },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy,          badge: null },
  { href: '/alerts',      label: 'Alerts',      icon: Bell,            badge: 'alerts' as const },
  { href: '/anomalies',   label: 'Anomalies',   icon: AlertTriangle,   badge: 'anomalies' as const },
  { href: '/predictions', label: 'Predictions', icon: Brain,           badge: null },
];

// ── component ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();

  // Fetch alert + anomaly counts for badges (light polls — 30s / 20s)
  const { data: alerts } = useSWR<AlertEvent[]>(
    '/api/v1/alerts?limit=200', fetcher, { refreshInterval: 30_000 }
  );
  const { data: anomalies } = useSWR<AnomalyRecord[]>(
    '/api/v1/anomalies', fetcher, { refreshInterval: 20_000 }
  );

  // Count alerts newer than last-seen timestamp.
  // pathname is a dep so the badge clears immediately on navigation (not waiting for next SWR poll).
  const alertCount = useMemo(() => {
    if (pathname === '/alerts') return 0;
    if (!alerts) return 0;
    const seenAt = getSeenAt(LS_ALERTS);
    return alerts.filter(a => new Date(a.triggeredAt).getTime() > seenAt).length;
  }, [alerts, pathname]);

  // Anomaly count clears immediately when on the anomalies page.
  const anomalyCount = pathname === '/anomalies' ? 0 : (anomalies?.length ?? 0);

  // Persist seen timestamp so badge stays cleared after navigating away and back
  useEffect(() => {
    if (pathname === '/alerts')    markSeen(LS_ALERTS);
    if (pathname === '/anomalies') markSeen(LS_ANOMALIES);
  }, [pathname]);

  const badgeCounts = { alerts: alertCount, anomalies: anomalyCount } as const;

  return (
    <aside className={clsx(
      'fixed left-0 top-0 z-40 h-full flex flex-col',
      'w-16 lg:w-60',
      'bg-slate-950 border-r border-slate-800',
      'transition-all duration-300'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-800 shrink-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
          <TrafficCone className="w-4 h-4 text-white" />
        </div>
        <span className="hidden lg:block font-semibold text-sm tracking-wide bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent whitespace-nowrap overflow-hidden">
          TrafficOS
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          const count = badge ? badgeCounts[badge] : 0;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                'transition-all duration-200',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-500'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 border-l-2 border-transparent'
              )}
            >
              {/* Icon with small dot on mobile when there's a count */}
              <span className="relative shrink-0">
                <Icon
                  className={clsx(
                    'w-5 h-5',
                    isActive ? 'text-blue-400' : 'text-slate-500'
                  )}
                />
                {/* Mobile: tiny dot indicator (badge text hidden at w-16) */}
                {count > 0 && (
                  <span className="lg:hidden absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                )}
              </span>

              {/* Desktop: label + pill badge */}
              <span className="hidden lg:flex items-center gap-2 flex-1 min-w-0">
                <span className="truncate">{label}</span>
                <Badge count={count} />
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-4 py-4 border-t border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <div className="hidden lg:flex items-center justify-between flex-1 min-w-0">
            <span className="text-xs text-emerald-400 font-medium">LIVE</span>
            <span className="text-xs text-slate-600">v1.0.0</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
