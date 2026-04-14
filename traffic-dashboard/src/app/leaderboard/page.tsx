// src/app/leaderboard/page.tsx
'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useMemo } from 'react';
import { fetcher } from '@/lib/api';
import { RoadStatus } from '@/types';
import { CongestionBadge } from '@/components/CongestionBadge';

function speedBarWidth(speed: number): number {
  return Math.min(100, Math.round((speed / 80) * 100));
}

function speedBarColor(speed: number): string {
  if (speed < 10) return 'bg-red-500';
  if (speed < 20) return 'bg-orange-500';
  if (speed < 30) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function speedTextColor(speed: number): string {
  if (speed < 10) return 'text-red-400';
  if (speed < 20) return 'text-orange-400';
  if (speed < 30) return 'text-yellow-400';
  return 'text-emerald-400';
}

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}`;
}

function rankRowTint(rank: number): string {
  if (rank === 1) return 'bg-yellow-500/5 hover:bg-yellow-500/10';
  if (rank === 2) return 'bg-slate-400/5 hover:bg-slate-400/10';
  if (rank === 3) return 'bg-orange-600/5 hover:bg-orange-600/10';
  return 'hover:bg-slate-800/40';
}

export default function LeaderboardPage() {
  const { data: roads, isLoading } = useSWR<RoadStatus[]>(
    '/api/v1/roads',
    fetcher,
    { refreshInterval: 30_000 }
  );

  // Ranked by avgSpeed descending (best = fastest)
  const ranked = useMemo(() => {
    if (!roads) return [];
    return [...roads].sort((a, b) => b.avgSpeed - a.avgSpeed);
  }, [roads]);

  const top5 = ranked.slice(0, 5);
  const bottom5 = [...ranked].reverse().slice(0, 5);

  const trafficScore = useMemo(() => {
    if (!roads || roads.length === 0) return 0;
    const scores = roads.map(r => Math.min((r.avgSpeed / 50) * 100, 100));
    return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  }, [roads]);

  const totalVehicles = useMemo(() => {
    if (!roads) return 0;
    return roads.reduce((s, r) => s + r.totalVehicles, 0);
  }, [roads]);

  const congestedPct = useMemo(() => {
    if (!roads || roads.length === 0) return 0;
    return Math.round((roads.filter(r => r.congested).length / roads.length) * 100);
  }, [roads]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-100">Road Leaderboard</h1>
        <div className="glass flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Road Leaderboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">All roads ranked by average speed</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Network Health</p>
          <p className="text-2xl font-bold font-mono text-blue-400">{trafficScore}</p>
          <p className="text-xs text-slate-600">out of 100</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Vehicles</p>
          <p className="text-2xl font-bold font-mono text-emerald-400">{totalVehicles.toLocaleString()}</p>
          <p className="text-xs text-slate-600">across all roads</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Congested</p>
          <p className="text-2xl font-bold font-mono text-orange-400">{congestedPct}%</p>
          <p className="text-xs text-slate-600">of monitored roads</p>
        </div>
      </div>

      {/* Best / Worst columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Best performing */}
        <div className="glass p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">🏆 Best Performing</h2>
          <div className="space-y-3">
            {top5.map((road, idx) => (
              <Link
                key={road.roadId}
                href={`/roads/${road.roadId}`}
                className="flex items-center gap-3 group"
              >
                <span className="w-8 text-center text-lg leading-none shrink-0">
                  {idx < 3 ? rankMedal(idx + 1) : (
                    <span className="text-xs font-mono text-slate-500">#{idx + 1}</span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 font-medium truncate group-hover:text-blue-400 transition-colors">
                    {road.roadName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${speedBarColor(road.avgSpeed)}`}
                        style={{ width: `${speedBarWidth(road.avgSpeed)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono shrink-0 ${speedTextColor(road.avgSpeed)}`}>
                      {road.avgSpeed.toFixed(1)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Worst congestion */}
        <div className="glass p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">⚠️ Worst Congestion</h2>
          <div className="space-y-3">
            {bottom5.map((road, idx) => (
              <Link
                key={road.roadId}
                href={`/roads/${road.roadId}`}
                className="flex items-center gap-3 group"
              >
                <span className="w-8 text-center text-xs font-mono text-slate-600 shrink-0">
                  #{ranked.length - idx}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 font-medium truncate group-hover:text-blue-400 transition-colors">
                    {road.roadName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${speedBarColor(road.avgSpeed)}`}
                        style={{ width: `${speedBarWidth(road.avgSpeed)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono shrink-0 ${speedTextColor(road.avgSpeed)}`}>
                      {road.avgSpeed.toFixed(1)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Full ranking table */}
      <div className="glass overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">Full Network Ranking</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {ranked.length} roads · click a row for details
          </p>
        </div>
        <div className="overflow-x-auto custom-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left px-6 py-3 font-medium w-14">Rank</th>
                <th className="text-left px-3 py-3 font-medium">Road</th>
                <th className="text-right px-3 py-3 font-medium w-40">Speed</th>
                <th className="text-right px-3 py-3 font-medium w-24">Vehicles</th>
                <th className="text-right px-6 py-3 font-medium w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {ranked.map((road, idx) => {
                const rank = idx + 1;
                return (
                  <tr
                    key={road.roadId}
                    onClick={() => window.location.href = `/roads/${road.roadId}`}
                    className={`cursor-pointer transition-colors ${rankRowTint(rank)}`}
                  >
                    <td className="px-6 py-3 text-center">
                      <span className="text-base leading-none">
                        {idx < 3 ? rankMedal(rank) : (
                          <span className="text-xs font-mono text-slate-500">#{rank}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-200 leading-snug">{road.roadName}</p>
                      <p className="text-xs font-mono text-slate-600">{road.roadId}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${speedBarColor(road.avgSpeed)}`}
                            style={{ width: `${speedBarWidth(road.avgSpeed)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono w-16 text-right ${speedTextColor(road.avgSpeed)}`}>
                          {road.avgSpeed.toFixed(1)} km/h
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs font-mono text-slate-400">{road.totalVehicles}</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <CongestionBadge avgSpeed={road.avgSpeed} congested={road.congested} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
