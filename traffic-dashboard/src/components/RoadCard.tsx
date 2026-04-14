// src/components/RoadCard.tsx
'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { RoadStatus, SpeedPoint } from '@/types';
import { CongestionBadge } from './CongestionBadge';
import { SparkLine } from './SparkLine';

interface Props {
  road: RoadStatus;
  history?: SpeedPoint[];
}

function speedBarWidth(speed: number): number {
  return Math.min(100, Math.round((speed / 80) * 100));
}

function speedColor(speed: number) {
  if (speed < 10) return 'bg-red-500';
  if (speed < 20) return 'bg-orange-500';
  if (speed < 30) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function glowClass(speed: number) {
  if (speed < 10) return 'glow-red';
  if (speed < 20) return 'glow-orange';
  if (speed < 30) return 'glow-yellow';
  return 'glow-green';
}

function formatUpdatedAt(updatedAt: string): string {
  try {
    return formatDistanceToNow(new Date(updatedAt), { addSuffix: true });
  } catch {
    return 'just now';
  }
}

export function RoadCard({ road, history }: Props) {
  return (
    <Link href={`/roads/${road.roadId}`}>
      <motion.article
        whileHover={{ scale: 1.02, y: -2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={clsx(
          'glass p-4 cursor-pointer transition-colors duration-200',
          'hover:border-slate-600',
          'animate-fade-in group',
          glowClass(road.avgSpeed)
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-xs font-mono text-slate-500 mb-0.5">{road.roadId}</p>
            <h3 className="font-semibold text-sm text-slate-100 truncate leading-snug">
              {road.roadName}
            </h3>
          </div>
          <CongestionBadge avgSpeed={road.avgSpeed} congested={road.congested} />
        </div>

        {/* Speed bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Speed</span>
            <span className="font-mono font-medium text-slate-200">
              {road.avgSpeed.toFixed(1)} km/h
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-700', speedColor(road.avgSpeed))}
              style={{ width: `${speedBarWidth(road.avgSpeed)}%` }}
            />
          </div>
        </div>

        {/* Sparkline */}
        {history && history.length > 1 && (
          <div className="mb-3">
            <SparkLine data={history} height={36} />
          </div>
        )}

        {/* Footer stats */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {road.totalVehicles} vehicles
          </span>
          <span className="text-slate-600 text-xs">
            {formatUpdatedAt(road.updatedAt)}
          </span>
          <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
            →
          </span>
        </div>
      </motion.article>
    </Link>
  );
}
