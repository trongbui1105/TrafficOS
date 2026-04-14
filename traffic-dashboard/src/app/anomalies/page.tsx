// src/app/anomalies/page.tsx
'use client';

import useSWR from 'swr';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { fetcher } from '@/lib/api';
import { num } from '@/lib/fmt';
import { AnomalyRecord } from '@/types';
import { AlertTriangle, TrendingDown, TrendingUp, RefreshCw } from 'lucide-react';

const severityColor = {
  HIGH:   { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400'    },
  MEDIUM: { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400'  },
  LOW:    { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400'   },
};

function AnomalyCard({ anomaly, i }: { anomaly: AnomalyRecord; i: number }) {
  const isSlow = anomaly.anomalyType === 'slow_anomaly';
  const color  = severityColor[anomaly.severity];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: i * 0.04 }}
      className={`glass p-4 border ${color.border} ${color.bg} rounded-xl`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* road name + link */}
          <div className="flex items-center gap-2 mb-1">
            {isSlow
              ? <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />
              : <TrendingUp   className="w-4 h-4 text-emerald-400 shrink-0" />
            }
            <Link
              href={`/roads/${anomaly.roadId}`}
              className="text-sm font-semibold text-slate-200 hover:text-blue-400 transition-colors truncate"
            >
              {anomaly.roadName}
            </Link>
          </div>

          {/* speed row */}
          <div className="flex items-center gap-4 text-xs text-slate-400 mb-2">
            <span>
              Current: <span className={`font-mono font-semibold ${isSlow ? 'text-red-400' : 'text-emerald-400'}`}>
                {num(anomaly.currentSpeed).toFixed(1)} km/h
              </span>
            </span>
            <span>
              Expected: <span className="font-mono text-slate-300">{num(anomaly.expectedSpeed).toFixed(1)} km/h</span>
            </span>
            <span>
              σ = <span className="font-mono font-semibold text-slate-200">{num(anomaly.deviationSigma).toFixed(2)}</span>
            </span>
          </div>

          {/* type pill */}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${color.border} ${color.text} font-medium`}>
            {isSlow ? '🐢 Unusually slow' : '⚡ Unusually fast'}
          </span>
        </div>

        {/* severity badge */}
        <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${color.border} ${color.text} ${color.bg}`}>
          {anomaly.severity}
        </span>
      </div>

      <div className="mt-2 text-xs text-slate-600 font-mono">
        {new Date(anomaly.detectedAt).toLocaleTimeString()}
      </div>
    </motion.div>
  );
}

export default function AnomaliesPage() {
  const { data, isLoading, mutate, isValidating } = useSWR<AnomalyRecord[]>(
    '/api/v1/anomalies',
    fetcher,
    { refreshInterval: 20_000 }
  );

  const high   = data?.filter(a => a.severity === 'HIGH')   ?? [];
  const medium = data?.filter(a => a.severity === 'MEDIUM') ?? [];
  const low    = data?.filter(a => a.severity === 'LOW')    ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            ML Anomaly Detection
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Roads deviating ≥ 2σ from historical speed baseline · auto-refreshes every 20s
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'HIGH', count: high.length,   color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30'    },
          { label: 'MEDIUM', count: medium.length, color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30'  },
          { label: 'LOW',  count: low.length,    color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30'   },
        ].map(s => (
          <div key={s.label} className={`glass p-4 border ${s.border} ${s.bg} rounded-xl text-center`}>
            <div className={`text-3xl font-bold font-mono ${s.color}`}>{s.count}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label} anomalies</div>
          </div>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass p-4 h-24 animate-pulse bg-slate-800/50 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && (!data || data.length === 0) && (
        <div className="glass p-12 text-center text-slate-600">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No anomalies detected right now.</p>
          <p className="text-xs mt-1">The ML model may still be training (needs ~50 data points per road).</p>
        </div>
      )}

      {/* Anomaly cards grouped by severity */}
      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((anomaly, i) => (
            <AnomalyCard key={`${anomaly.roadId}-${anomaly.detectedAt}`} anomaly={anomaly} i={i} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
