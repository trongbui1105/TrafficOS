// src/app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveTraffic } from '@/hooks/useLiveTraffic';
import { RoadCard } from '@/components/RoadCard';
import { StatCard } from '@/components/StatCard';
import { AlertBadge } from '@/components/AlertBadge';
import { CityScore } from '@/components/CityScore';
import { Search, AlertTriangle, Gauge, Map as MapIcon } from 'lucide-react';

type Filter = 'all' | 'congested' | 'flowing';

function formatClock(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[date.getDay()];
  const dom = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${day} ${dom} ${month} · ${hh}:${mm}:${ss}`;
}

export default function HomePage() {
  const { roads, alerts, connected, speedHistory, trafficScore } = useLiveTraffic();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [clock, setClock] = useState('');

  // Clock — updates every second
  useEffect(() => {
    setClock(formatClock(new Date()));
    const id = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  const roadList = useMemo(() => {
    let list = Array.from(roads.values());
    if (filter === 'congested') list = list.filter(r => r.congested);
    if (filter === 'flowing')   list = list.filter(r => !r.congested);
    if (search) list = list.filter(r =>
      r.roadName.toLowerCase().includes(search.toLowerCase()) ||
      r.roadId.toLowerCase().includes(search.toLowerCase())
    );
    return list.sort((a, b) => a.avgSpeed - b.avgSpeed);
  }, [roads, filter, search]);

  const total     = roads.size;
  const congested = Array.from(roads.values()).filter(r => r.congested).length;
  const avgSpeedVal = total > 0
    ? (Array.from(roads.values()).reduce((s, r) => s + r.avgSpeed, 0) / total)
    : 0;
  const avgSpeedStr = total > 0 ? `${avgSpeedVal.toFixed(1)} km/h` : '—';

  return (
    <div className="space-y-6">

      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Ho Chi Minh City Traffic</h1>
          <p className="text-sm text-slate-500 mt-0.5 font-mono">{clock}</p>
        </div>
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
          connected
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-slate-800 border-slate-700 text-slate-500'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          {connected ? 'Connected' : 'Reconnecting…'}
        </div>
      </div>

      {/* ── Row 1: CityScore + 3 stat cards ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <CityScore score={trafficScore} />
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Roads Monitored"
            value={total}
            accent="blue"
            sub="active monitoring points"
            icon={<MapIcon className="w-8 h-8 text-blue-400" />}
          />
          <StatCard
            label="Congested Roads"
            value={congested}
            accent="orange"
            sub={total ? `${Math.round((congested / total) * 100)}% of network` : ''}
            icon={<AlertTriangle className="w-8 h-8 text-orange-400" />}
          />
          <StatCard
            label="Avg Network Speed"
            value={avgSpeedStr}
            accent="emerald"
            sub="across all monitored roads"
            icon={<Gauge className="w-8 h-8 text-emerald-400" />}
          />
        </div>
      </div>

      {/* ── Row 2: Recent alerts strip ────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Recent Alerts
            </h2>
            {alerts.length > 3 && (
              <Link href="/alerts" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                View all {alerts.length} →
              </Link>
            )}
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 3).map((a, i) => (
              <AlertBadge key={`${a.roadId}-${a.triggeredAt}-${i}`} alert={a} />
            ))}
          </div>
        </div>
      )}

      {/* ── Row 3: Filter bar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search roads…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-4 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all w-52"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
          {(['all', 'congested', 'flowing'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                filter === f
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-600 ml-auto">
          {roadList.length} road{roadList.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Row 4: Road grid ──────────────────────────────────────────── */}
      {total === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass p-4 animate-pulse">
              <div className="h-3 bg-slate-800 rounded w-1/3 mb-2" />
              <div className="h-4 bg-slate-800 rounded w-3/4 mb-4" />
              <div className="h-1.5 bg-slate-800 rounded-full mb-3" />
              <div className="h-8 bg-slate-800/50 rounded mb-3" />
              <div className="flex justify-between">
                <div className="h-3 bg-slate-800 rounded w-1/4" />
                <div className="h-3 bg-slate-800 rounded w-1/5" />
              </div>
            </div>
          ))}
        </div>
      ) : roadList.length === 0 ? (
        <div className="glass py-16 flex items-center justify-center">
          <p className="text-slate-500 text-sm">No roads match your filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {roadList.map(road => (
            <RoadCard
              key={road.roadId}
              road={road}
              history={speedHistory.get(road.roadId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
