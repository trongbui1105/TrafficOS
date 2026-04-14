// src/app/alerts/page.tsx
'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useLiveTraffic } from '@/hooks/useLiveTraffic';
import { AlertBadge } from '@/components/AlertBadge';
import { StatCard } from '@/components/StatCard';
import { fetcher } from '@/lib/api';
import type { AlertEvent } from '@/types';
import { Download, List, Clock } from 'lucide-react';

type SeverityFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
type ViewMode = 'list' | 'timeline';

function deduplicateAlerts(a: AlertEvent[], b: AlertEvent[]): AlertEvent[] {
  const seen = new Set<string>();
  const merged: AlertEvent[] = [];
  for (const alert of [...a, ...b]) {
    const key = `${alert.roadId}|${alert.triggeredAt}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(alert);
    }
  }
  return merged.sort((x, y) =>
    new Date(y.triggeredAt).getTime() - new Date(x.triggeredAt).getTime()
  );
}

function severityDotColor(severity: AlertEvent['severity']): string {
  if (severity === 'HIGH')   return 'bg-red-500';
  if (severity === 'MEDIUM') return 'bg-orange-500';
  return 'bg-yellow-500';
}

function severityLineColor(severity: AlertEvent['severity']): string {
  if (severity === 'HIGH')   return 'border-red-500/30';
  if (severity === 'MEDIUM') return 'border-orange-500/30';
  return 'border-yellow-500/30';
}

function formatTimelineTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function formatTimelineDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function downloadAlertsCSV(alerts: AlertEvent[]) {
  const header = 'roadId,roadName,severity,message,triggeredAt';
  const rows = alerts.map(a =>
    [a.roadId, `"${a.roadName}"`, a.severity, `"${a.message.replace(/"/g, '""')}"`, a.triggeredAt].join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `traffic-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AlertsPage() {
  const { alerts: wsAlerts, connected } = useLiveTraffic();
  const [filter, setFilter]     = useState<SeverityFilter>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // REST alerts (historical)
  const { data: restAlerts } = useSWR<AlertEvent[]>(
    '/api/v1/alerts?limit=100',
    fetcher,
    { refreshInterval: 30_000 }
  );

  const allAlerts = useMemo(
    () => deduplicateAlerts(wsAlerts, restAlerts ?? []),
    [wsAlerts, restAlerts]
  );

  const filtered: AlertEvent[] = filter === 'ALL'
    ? allAlerts
    : allAlerts.filter(a => a.severity === filter);

  const high   = allAlerts.filter(a => a.severity === 'HIGH').length;
  const medium = allAlerts.filter(a => a.severity === 'MEDIUM').length;
  const low    = allAlerts.filter(a => a.severity === 'LOW').length;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Alert Feed</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Live congestion alerts · WebSocket + ClickHouse
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export CSV */}
          <button
            onClick={() => downloadAlertsCSV(allAlerts)}
            disabled={allAlerts.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {/* Connection badge */}
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
            connected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            {connected ? 'Live' : 'Reconnecting…'}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total alerts"  value={allAlerts.length} accent="blue" />
        <StatCard label="High severity" value={high}             accent="red" />
        <StatCard label="Medium"        value={medium}           accent="orange" />
        <StatCard label="Low"           value={low}              accent="blue" />
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Severity filter */}
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
          {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as SeverityFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f}
              {f !== 'ALL' && (
                <span className="ml-1.5 text-slate-600">
                  {f === 'HIGH' ? high : f === 'MEDIUM' ? medium : low}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800 ml-auto">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'list'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <List className="w-3 h-3" /> List
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'timeline'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Clock className="w-3 h-3" /> Timeline
          </button>
        </div>
      </div>

      {/* Alert content */}
      {filtered.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-slate-400 font-medium">
            {allAlerts.length === 0 ? 'No alerts yet' : `No ${filter.toLowerCase()} severity alerts`}
          </p>
          <p className="text-slate-600 text-sm mt-1">
            {allAlerts.length === 0
              ? 'Alerts appear here when congestion is detected on any road'
              : 'Try selecting a different severity filter'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* List view */
        <div className="space-y-2 custom-scroll max-h-[640px] overflow-y-auto pr-1">
          {filtered.map((alert, i) => (
            <AlertBadge key={`${alert.roadId}-${alert.triggeredAt}-${i}`} alert={alert} />
          ))}
        </div>
      ) : (
        /* Timeline view */
        <div className="relative pl-6 custom-scroll max-h-[640px] overflow-y-auto pr-1">
          {/* Vertical line */}
          <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-800" />

          <div className="space-y-0">
            {filtered.map((alert, i) => {
              const showDateMarker = i === 0 ||
                formatTimelineDate(filtered[i - 1].triggeredAt) !== formatTimelineDate(alert.triggeredAt);
              return (
                <div key={`${alert.roadId}-${alert.triggeredAt}-${i}`}>
                  {showDateMarker && (
                    <div className="flex items-center gap-2 mb-3 mt-4 first:mt-0">
                      <div className="absolute left-0 w-4 h-px bg-slate-700" />
                      <span className="text-xs text-slate-600 font-medium ml-2">
                        {formatTimelineDate(alert.triggeredAt)}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-4 pb-4">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`relative z-10 w-3 h-3 rounded-full shrink-0 mt-3.5 -ml-[18px] border-2 border-slate-950 ${severityDotColor(alert.severity)}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-600 font-mono tabular-nums">
                          {formatTimelineTime(alert.triggeredAt)}
                        </span>
                      </div>
                      <div className={`rounded-xl border p-3 ${severityLineColor(alert.severity)} bg-slate-900/50`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold ${
                            alert.severity === 'HIGH' ? 'text-red-400' :
                            alert.severity === 'MEDIUM' ? 'text-orange-400' : 'text-yellow-400'
                          }`}>
                            {alert.severity}
                          </span>
                          <span className="text-xs font-mono text-slate-500">{alert.roadId}</span>
                          <span className="text-xs text-slate-500 truncate">{alert.roadName}</span>
                        </div>
                        <p className="text-sm text-slate-300 leading-snug">{alert.message}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
