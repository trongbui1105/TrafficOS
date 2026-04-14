// src/app/predictions/page.tsx
'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import { fetcher } from '@/lib/api';
import { num } from '@/lib/fmt';
import { CityForecast, RoadStatus } from '@/types';
import { Brain, TrendingDown, TrendingUp, Clock } from 'lucide-react';

function SpeedGauge({ value, label, max = 60 }: { value: number | null | undefined; label: string; max?: number }) {
  const safe = num(value);
  const pct = Math.min((safe / max) * 100, 100);
  const color = safe < 20 ? '#ef4444' : safe < 35 ? '#f59e0b' : '#10b981';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} 100`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {value != null
            ? <span className="text-xl font-bold font-mono" style={{ color }}>{safe.toFixed(0)}</span>
            : <span className="text-sm text-slate-600">—</span>
          }
          <span className="text-xs text-slate-500">km/h</span>
        </div>
      </div>
      <span className="text-xs text-slate-400 text-center">{label}</span>
    </div>
  );
}

export default function PredictionsPage() {
  const { data, isLoading } = useSWR<CityForecast>(
    '/api/v1/predict/city',
    fetcher,
    { refreshInterval: 30_000 }
  );

  // Build id→name lookup so we can show road names instead of IDs
  const { data: allRoads } = useSWR<RoadStatus[]>('/api/v1/roads', fetcher, { refreshInterval: 60_000 });
  const roadName = useMemo(() => {
    const map = new Map<string, string>();
    allRoads?.forEach(r => map.set(r.roadId, r.roadName));
    return (id: string) => map.get(id) ?? id;
  }, [allRoads]);

  // Build sparkline data from the three speed points
  const chartData = data
    ? [
        { t: 'Now',  speed: num(data.cityAvgSpeedNow) || undefined },
        { t: '+30m', speed: num(data.cityAvgSpeed30min) || undefined },
        { t: '+1h',  speed: num(data.cityAvgSpeed1h) || undefined },
      ]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Brain className="w-6 h-6 text-violet-400" />
          City-Wide Forecast
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          ML-based aggregate congestion forecast for all 572 HCMC roads · refreshes every 30s
        </p>
      </div>

      {isLoading && (
        <div className="glass p-8 animate-pulse bg-slate-800/50 rounded-xl h-64" />
      )}

      {data && (
        <>
          {/* Speed gauges */}
          <div className="glass p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-6">City Average Speed Trajectory</h2>
            <div className="flex justify-around flex-wrap gap-6 mb-6">
              <SpeedGauge value={data.cityAvgSpeedNow}   label="Now" />
              <SpeedGauge value={data.cityAvgSpeed30min} label="In 30 min" />
              <SpeedGauge value={data.cityAvgSpeed1h}    label="In 1 hour" />
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} unit=" km/h" width={64} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: unknown) => [`${num(v).toFixed(1)} km/h`, 'Avg speed']}
                />
                <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
                <Area type="monotone" dataKey="speed" stroke="#8b5cf6" strokeWidth={2.5}
                  fill="url(#cityGrad)" dot={{ fill: '#8b5cf6', r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Congestion % cards */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Congested roads in 30 min', value: data.next30minCongestionPct, icon: Clock },
              { label: 'Congested roads in 1 hour', value: data.next1hCongestionPct,   icon: Clock },
            ].map(({ label, value, icon: Icon }) => {
              const safe = num(value);
              const severity = safe > 40 ? 'red' : safe > 20 ? 'amber' : 'emerald';
              const colorMap = {
                red:     { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     hex: '#ef4444' },
                amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   hex: '#f59e0b' },
                emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', hex: '#10b981' },
              }[severity];
              return (
                <div key={label} className={`glass p-5 border ${colorMap.border} ${colorMap.bg} rounded-xl`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${colorMap.text}`} />
                    <span className="text-xs text-slate-400">{label}</span>
                  </div>
                  <div className={`text-4xl font-bold font-mono ${colorMap.text}`}>
                    {value != null ? `${safe.toFixed(1)}%` : '—'}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${safe}%`, background: colorMap.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Peak / Improving roads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Peak (most congested predicted) */}
            <div className="glass p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-slate-300">Most Congested (30 min)</h3>
              </div>
              <div className="space-y-2">
                {(!data.peakRoads || data.peakRoads.length === 0) && (
                  <p className="text-xs text-slate-600">No data yet</p>
                )}
                {(data.peakRoads ?? []).map((roadId, i) => (
                  <Link
                    key={roadId}
                    href={`/roads/${roadId}`}
                    className="flex items-center gap-2 text-xs hover:text-blue-400 transition-colors group"
                  >
                    <span className="w-4 text-slate-600 font-mono">{i + 1}.</span>
                    <span className="text-slate-300 group-hover:text-blue-400 transition-colors">{roadName(roadId)}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Improving roads */}
            <div className="glass p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-300">Most Improving (30 min)</h3>
              </div>
              <div className="space-y-2">
                {(!data.improvingRoads || data.improvingRoads.length === 0) && (
                  <p className="text-xs text-slate-600">No data yet</p>
                )}
                {(data.improvingRoads ?? []).map((roadId, i) => (
                  <Link
                    key={roadId}
                    href={`/roads/${roadId}`}
                    className="flex items-center gap-2 text-xs hover:text-blue-400 transition-colors group"
                  >
                    <span className="w-4 text-slate-600 font-mono">{i + 1}.</span>
                    <span className="text-slate-300 group-hover:text-blue-400 transition-colors">{roadName(roadId)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-700 text-right">
            {data.generatedAt && <>Generated at {new Date(data.generatedAt).toLocaleTimeString()} UTC</>}
          </p>
        </>
      )}

      {!isLoading && !data && (
        <div className="glass p-12 text-center text-slate-600">
          <Brain className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Predictor service not available.</p>
          <p className="text-xs mt-1">Start the traffic-predictor container and wait for initial training.</p>
        </div>
      )}
    </motion.div>
  );
}
