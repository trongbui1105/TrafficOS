// src/app/roads/[id]/page.tsx
'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { use, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, CartesianGrid,
} from 'recharts';
import { fetcher } from '@/lib/api';
import { num } from '@/lib/fmt';
import { RoadHistory, RoadStatus, RoadPrediction } from '@/types';
import { SpeedChart } from '@/components/SpeedChart';
import { CongestionBadge } from '@/components/CongestionBadge';
import { StatCard } from '@/components/StatCard';
import { ChevronLeft, Trophy, TrendingUp, TrendingDown, Minus, Brain, AlertTriangle } from 'lucide-react';

interface Props { params: Promise<{ id: string }> }

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-800 rounded animate-pulse ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card space-y-2">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-6 w-28" />
          </div>
        ))}
      </div>
      <div className="glass p-6 h-72">
        <SkeletonBlock className="h-4 w-40 mb-4" />
        <SkeletonBlock className="h-56 w-full" />
      </div>
    </div>
  );
}

// ── Forecast chart ────────────────────────────────────────────────────────────

interface ForecastPoint {
  label: string;
  predicted: number;
  lower: number;
  upper: number;
  congestionPct: number;
}

function ForecastChart({ prediction }: { prediction: RoadPrediction }) {
  const data: ForecastPoint[] = prediction?.next1h?.map(f => ({
    label: `+${Math.round((new Date(f.timestamp).getTime() - new Date(prediction.generatedAt).getTime()) / 60000)}m`,
    predicted: f.predictedAvgSpeed,
    lower: f.lowerBound,
    upper: f.upperBound,
    congestionPct: Math.round(f.congestionProbability * 100),
  }));

  const trendIcon = prediction.trendDirection === 'rising'
    ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
    : prediction.trendDirection === 'falling'
      ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
      : <Minus className="w-3.5 h-3.5 text-slate-400" />;

  const confidenceColor = prediction.confidence === 'high'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : prediction.confidence === 'medium'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-slate-400 bg-slate-700/30 border-slate-600/30';

  return (
    <div className="space-y-4">
      {/* header stats */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          {trendIcon}
          <span className="text-slate-400">Trend: <span className="text-slate-200 font-medium capitalize">{prediction.trendDirection}</span></span>
        </div>
        <span className={`px-2 py-0.5 rounded-full border font-medium ${confidenceColor}`}>
          {prediction.confidence} confidence
        </span>
        <span className="text-slate-500">
          Baseline: {num(prediction.historicalMean).toFixed(1)} ± {num(prediction.historicalStd).toFixed(1)} km/h
        </span>
      </div>

      {/* chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.08} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} unit=" km/h" width={64} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(val: unknown, name: string) => [
              `${num(val).toFixed(1)} km/h`,
              name === 'predicted' ? 'Predicted' : name === 'upper' ? 'Upper (80%)' : 'Lower (80%)',
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
          {/* congestion threshold */}
          <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: 'Congested', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
          {/* confidence band */}
          <Area type="monotone" dataKey="upper" stroke="none" fill="url(#bandGrad)" legendType="none" name="upper" />
          <Area type="monotone" dataKey="lower" stroke="none" fill="#0f172a" legendType="none" name="lower" />
          {/* predicted line */}
          <Area
            type="monotone"
            dataKey="predicted"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#forecastGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
            name="predicted"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* congestion probability badges */}
      <div className="flex flex-wrap gap-1.5">
        {data?.filter((_, i) => i % 2 === 0).map(d => (
          <div key={d.label} className="text-xs rounded px-2 py-0.5 font-mono"
            style={{
              background: `rgba(239,68,68,${d.congestionPct / 200})`,
              color: d.congestionPct > 40 ? '#fca5a5' : '#64748b',
              border: '1px solid rgba(239,68,68,0.15)',
            }}>
            {d.label}: {d.congestionPct}%
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RoadDetailPage({ params }: Props) {
  const { id: roadId } = use(params);

  const { data: history, isLoading: histLoading } = useSWR<RoadHistory[]>(
    `/api/v1/roads/${roadId}/history`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { data: analytics, isLoading: analyticsLoading } = useSWR<RoadHistory[]>(
    `/api/v1/roads/${roadId}/analytics`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const { data: prediction, isLoading: predLoading } = useSWR<RoadPrediction>(
    `/api/v1/roads/${roadId}/forecast`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  // Network average for comparison
  const { data: allRoads } = useSWR<RoadStatus[]>('/api/v1/roads', fetcher, { refreshInterval: 60_000 });

  const networkAvg = useMemo(() => {
    if (!allRoads || allRoads.length === 0) return null;
    return allRoads.reduce((s, r) => s + r.avgSpeed, 0) / allRoads.length;
  }, [allRoads]);

  const latest = history?.[history.length - 1];
  const minSpeed = history?.length ? Math.min(...history.map(h => h.avgSpeed)).toFixed(1) : '—';
  const maxSpeed = history?.length ? Math.max(...history.map(h => h.avgSpeed)).toFixed(1) : '—';
  const avgVehicles = history?.length
    ? Math.round(history.reduce((s, h) => s + h.totalVehicles, 0) / history.length)
    : null;

  const vsDiff = useMemo(() => {
    if (!latest || !networkAvg) return null;
    const diff = latest.avgSpeed - networkAvg;
    return { diff, faster: diff >= 0 };
  }, [latest, networkAvg]);

  // Next 30-min predicted speed (first horizon ≥ 30)
  const pred30 = prediction?.next30min?.at(-1);
  const pred1h  = prediction?.next1h?.at(-1);

  if (histLoading && !history) {
    return <LoadingSkeleton />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ChevronLeft className="w-3 h-3" />
            Dashboard
          </Link>
          <span className="text-slate-700 text-xs">/</span>
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Trophy className="w-3 h-3" />
            Leaderboard
          </Link>
          <span className="text-slate-700 text-xs">/</span>
          <span className="text-xs font-mono text-slate-400">{roadId}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-mono text-slate-500 mb-1">{roadId}</p>
            <h1 className="text-2xl font-bold text-slate-100">
              {latest?.roadName ?? prediction?.roadName ?? 'Loading…'}
            </h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {vsDiff !== null && (
              <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${
                vsDiff.faster
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-400 border-red-500/30'
              }`}>
                {vsDiff.faster ? '▲' : '▼'}{' '}
                {Math.abs(vsDiff.diff).toFixed(1)} km/h {vsDiff.faster ? 'above' : 'below'} network avg
              </span>
            )}
            {latest && (
              <div className="flex items-center gap-2">
                <CongestionBadge avgSpeed={latest.avgSpeed} congested={latest.congested} />
                <span className="text-sm font-mono font-semibold text-slate-200">
                  {latest.avgSpeed.toFixed(1)} km/h
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats — now includes ML predictions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Current speed"
          value={latest ? `${latest.avgSpeed.toFixed(1)} km/h` : '—'}
          accent="blue"
        />
        <StatCard
          label="Min speed (1h)"
          value={minSpeed !== '—' ? `${minSpeed} km/h` : '—'}
          accent="red"
        />
        <StatCard
          label="Predicted 30m"
          value={pred30 ? `${pred30.predictedAvgSpeed.toFixed(1)} km/h` : predLoading ? '…' : '—'}
          accent="purple"
        />
        <StatCard
          label="Predicted 1h"
          value={pred1h ? `${pred1h.predictedAvgSpeed.toFixed(1)} km/h` : predLoading ? '…' : '—'}
          accent="orange"
        />
      </div>

      {/* ML Forecast panel */}
      <div className="glass p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-slate-200">ML Speed Forecast (next 60 min)</h2>
          </div>
          <span className="text-xs text-slate-600">α=0.65 baseline + β=0.35 trend · refreshes 30s</span>
        </div>
        {predLoading && !prediction ? (
          <div className="h-56"><SkeletonBlock className="h-full w-full" /></div>
        ) : prediction ? (
          <ForecastChart prediction={prediction} />
        ) : (
          <div className="h-40 flex flex-col items-center justify-center gap-2 text-slate-600 text-sm">
            <AlertTriangle className="w-5 h-5 text-slate-700" />
            <span>No forecast available — predictor may still be training</span>
          </div>
        )}
      </div>

      {/* Last hour chart */}
      <div className="glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Last Hour — Speed &amp; Volume</h2>
          <span className="text-xs text-slate-600">Auto-refreshes every 30s</span>
        </div>
        {histLoading ? (
          <div className="h-60"><SkeletonBlock className="h-full w-full" /></div>
        ) : history && history.length > 0 ? (
          <SpeedChart data={history} />
        ) : (
          <div className="h-60 flex items-center justify-center text-slate-600 text-sm">
            No data available yet
          </div>
        )}
      </div>

      {/* 24h analytics chart */}
      <div className="glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">24h Hourly Analytics</h2>
          <span className="text-xs text-slate-600">ClickHouse time-bucket query</span>
        </div>
        {analyticsLoading ? (
          <div className="h-60"><SkeletonBlock className="h-full w-full" /></div>
        ) : analytics && analytics.length > 0 ? (
          <SpeedChart data={analytics} />
        ) : (
          <div className="h-60 flex items-center justify-center text-slate-600 text-sm">
            No analytics data yet
          </div>
        )}
      </div>

      {/* Raw history table */}
      {history && history.length > 0 && (
        <div className="glass p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Raw Window Data</h2>
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left pb-2 font-medium">Window start</th>
                  <th className="text-right pb-2 font-medium">Avg speed</th>
                  <th className="text-right pb-2 font-medium">Vehicles</th>
                  <th className="text-right pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {[...history].reverse().slice(0, 20).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-1.5 font-mono text-slate-400">
                      {new Date(row.windowStart).toLocaleTimeString()}
                    </td>
                    <td className="py-1.5 text-right font-mono text-slate-200">
                      {row.avgSpeed.toFixed(1)} km/h
                    </td>
                    <td className="py-1.5 text-right font-mono text-slate-400">
                      {row.totalVehicles}
                    </td>
                    <td className="py-1.5 text-right">
                      <CongestionBadge avgSpeed={row.avgSpeed} congested={row.congested} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
