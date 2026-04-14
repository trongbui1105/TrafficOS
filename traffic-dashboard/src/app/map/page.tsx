// src/app/map/page.tsx
'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { useLiveTraffic } from '@/hooks/useLiveTraffic';
import { CongestionBadge } from '@/components/CongestionBadge';

// Road coordinates for HCMC roads
export const ROAD_COORDINATES: Record<string, [number, number]> = {
  R001: [10.7769, 106.7009],  // Nguyen Hue Boulevard
  R002: [10.7749, 106.6976],  // Le Loi Street
  R003: [10.7631, 106.6872],  // Tran Hung Dao Avenue
  R004: [10.7619, 106.6956],  // Vo Van Kiet Boulevard
  R005: [10.7831, 106.6893],  // Cach Mang Thang 8 Street
  R006: [10.7854, 106.6988],  // Hai Ba Trung Street
  R007: [10.7914, 106.6985],  // Dien Bien Phu Street
  R008: [10.8484, 106.7118],  // Pham Van Dong Boulevard
  R009: [10.7314, 106.6980],  // Nguyen Van Linh Parkway
  R010: [10.7736, 106.6840],  // Ly Thuong Kiet Street
  R011: [10.7785, 106.6947],  // Nam Ky Khoi Nghia Street
  R012: [10.7777, 106.7038],  // Dong Khoi Street
  R013: [10.7718, 106.7013],  // Pasteur Street
  R014: [10.7737, 106.7027],  // Ham Nghi Street
  R015: [10.7724, 106.7047],  // Ton Duc Thang Street
  R016: [10.8021, 106.6588],  // Cong Hoa Street
  R017: [10.8027, 106.6651],  // Hoang Van Thu Street
  R018: [10.8249, 106.6820],  // Au Co Street
};

const TrafficMap = dynamic(() => import('@/components/TrafficMap'), {
  ssr: false,
  loading: () => <LoadingMap />,
});

function LoadingMap() {
  return (
    <div className="flex-1 glass flex items-center justify-center min-h-[500px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Loading map…</p>
      </div>
    </div>
  );
}

function speedBarWidth(speed: number): number {
  return Math.min(100, Math.round((speed / 80) * 100));
}

function speedColor(speed: number): string {
  if (speed < 10) return 'bg-red-500';
  if (speed < 20) return 'bg-orange-500';
  if (speed < 30) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

export default function MapPage() {
  const { roads, connected } = useLiveTraffic();

  // Sort roads by speed (worst first)
  const sortedRoads = useMemo(() =>
    Array.from(roads.values()).sort((a, b) => a.avgSpeed - b.avgSpeed),
    [roads]
  );

  const lastUpdated = useMemo(() => {
    if (roads.size === 0) return null;
    const times = Array.from(roads.values())
      .map(r => new Date(r.updatedAt).getTime())
      .filter(t => !isNaN(t));
    if (times.length === 0) return null;
    return new Date(Math.max(...times));
  }, [roads]);

  return (
    <div className="space-y-4 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Live Traffic Map</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lastUpdated
              ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
              : 'Waiting for data…'}
          </p>
        </div>
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
          connected
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-slate-800 border-slate-700 text-slate-500'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          {connected ? 'Live' : 'Reconnecting…'}
        </div>
      </div>

      {/* Main layout: map + side panel */}
      <div className="flex gap-4 flex-col lg:flex-row" style={{ minHeight: 560 }}>
        {/* Map */}
        <div className="flex-1 glass overflow-hidden rounded-2xl relative" style={{ minHeight: 500 }}>
          <TrafficMap roads={roads} coordinates={ROAD_COORDINATES} />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[1000] glass px-3 py-2 rounded-xl flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Severe (&lt;10)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Heavy (&lt;20)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Slow (&lt;30)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Flowing
            </span>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-80 glass flex flex-col overflow-hidden rounded-2xl">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-200">Roads by Speed</h2>
            <p className="text-xs text-slate-500 mt-0.5">Worst congestion first</p>
          </div>
          <div className="flex-1 overflow-y-auto custom-scroll">
            {sortedRoads.length === 0 ? (
              <div className="p-4 text-center text-slate-600 text-sm">
                Waiting for road data…
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {sortedRoads.map(road => (
                  <Link
                    key={road.roadId}
                    href={`/roads/${road.roadId}`}
                    className="block px-4 py-3 hover:bg-slate-800/40 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-slate-500">{road.roadId}</p>
                        <p className="text-sm text-slate-200 font-medium truncate">{road.roadName}</p>
                      </div>
                      <CongestionBadge avgSpeed={road.avgSpeed} congested={road.congested} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${speedColor(road.avgSpeed)}`}
                          style={{ width: `${speedBarWidth(road.avgSpeed)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-slate-300 shrink-0">
                        {road.avgSpeed.toFixed(1)} km/h
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
