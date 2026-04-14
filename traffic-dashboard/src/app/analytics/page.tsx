// src/app/analytics/page.tsx
'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { fetcher } from '@/lib/api';
import { RoadStatus, AlertEvent } from '@/types';

function speedBarColor(speed: number): string {
  if (speed < 10) return '#ef4444';
  if (speed < 20) return '#f97316';
  if (speed < 30) return '#eab308';
  return '#10b981';
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 12,
  },
  labelStyle: { color: '#94a3b8' },
};

export default function AnalyticsPage() {
  const { data: roads, isLoading: roadsLoading } = useSWR<RoadStatus[]>(
    '/api/v1/roads',
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { data: alerts, isLoading: alertsLoading } = useSWR<AlertEvent[]>(
    '/api/v1/alerts?limit=200',
    fetcher,
    { refreshInterval: 60_000 }
  );

  // Alert frequency by hour of day (0-23)
  const alertsByHour = useMemo(() => {
    if (!alerts) return [];
    const counts = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    alerts.forEach(a => {
      try {
        const h = new Date(a.triggeredAt).getHours();
        if (h >= 0 && h < 24) counts[h].count++;
      } catch { /* ignore */ }
    });
    return counts;
  }, [alerts]);

  // 25 slowest roads — limiting keeps bar height and Y-axis labels readable
  const roadsBySpeed = useMemo(() => {
    if (!roads) return [];
    return [...roads].sort((a, b) => a.avgSpeed - b.avgSpeed).slice(0, 25);
  }, [roads]);

  // Congestion stats
  const stats = useMemo(() => {
    if (!roads || roads.length === 0) return null;
    const congested = roads.filter(r => r.congested).length;
    const pct = Math.round((congested / roads.length) * 100);
    const avg = (roads.reduce((s, r) => s + r.avgSpeed, 0) / roads.length).toFixed(1);
    const worst = roads.reduce((min, r) => r.avgSpeed < min.avgSpeed ? r : min, roads[0]);
    const best  = roads.reduce((max, r) => r.avgSpeed > max.avgSpeed ? r : max, roads[0]);
    return { congested, pct, avg, worst, best };
  }, [roads]);

  // Alert severity breakdown for pie chart
  const severityData = useMemo(() => {
    if (!alerts) return [];
    const high   = alerts.filter(a => a.severity === 'HIGH').length;
    const medium = alerts.filter(a => a.severity === 'MEDIUM').length;
    const low    = alerts.filter(a => a.severity === 'LOW').length;
    return [
      { name: 'HIGH',   value: high,   fill: '#ef4444' },
      { name: 'MEDIUM', value: medium, fill: '#f97316' },
      { name: 'LOW',    value: low,    fill: '#eab308' },
    ].filter(d => d.value > 0);
  }, [alerts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
        <span className="text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-full px-2.5 py-1">
          Powered by ClickHouse
        </span>
      </div>

      {/* Congestion summary stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Congested Now</p>
            <p className="text-2xl font-bold font-mono text-orange-400">{stats.pct}%</p>
            <p className="text-xs text-slate-600">{stats.congested} of {roads?.length} roads</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Speed</p>
            <p className="text-2xl font-bold font-mono text-blue-400">{stats.avg}</p>
            <p className="text-xs text-slate-600">km/h network avg</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Most Congested</p>
            <p className="text-lg font-bold text-red-400 truncate">{stats.worst.roadName}</p>
            <p className="text-xs text-slate-600 font-mono">{stats.worst.avgSpeed.toFixed(1)} km/h</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Fastest Road</p>
            <p className="text-lg font-bold text-emerald-400 truncate">{stats.best.roadName}</p>
            <p className="text-xs text-slate-600 font-mono">{stats.best.avgSpeed.toFixed(1)} km/h</p>
          </div>
        </div>
      )}

      {/* Current speed by road */}
      <div className="glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Current Speed by Road</h2>
          <span className="text-xs text-slate-600">25 slowest · refreshes 30s</span>
        </div>
        {roadsLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : roadsBySpeed.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-600 text-sm">
            No road data available
          </div>
        ) : (
          // 22px per row so every Y-axis label has room; min 200px
          <ResponsiveContainer width="100%" height={Math.max(200, roadsBySpeed.length * 22)}>
            <BarChart data={roadsBySpeed} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <XAxis
                type="number"
                domain={[0, 80]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
                tickFormatter={v => `${v}`}
              />
              <YAxis
                type="category"
                dataKey="roadName"
                width={200}
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                formatter={(value: number, _name: string, props) => [
                  `${value.toFixed(1)} km/h`,
                  props.payload?.roadName ?? 'Speed',
                ]}
                cursor={{ fill: '#1e293b' }}
              />
              <Bar dataKey="avgSpeed" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {roadsBySpeed.map((road) => (
                  <Cell key={road.roadId} fill={speedBarColor(road.avgSpeed)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alert frequency by hour */}
        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Alert Frequency by Hour</h2>
            <span className="text-xs text-slate-600">Last 200 alerts</span>
          </div>
          {alertsLoading ? (
            <div className="h-56 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={alertsByHour} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                <XAxis
                  dataKey="hour"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={{ stroke: '#1e293b' }}
                  tickLine={false}
                  tickFormatter={h => `${h}h`}
                  interval={3}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [v, 'Alerts']}
                  labelFormatter={h => `Hour ${h}:00`}
                  cursor={{ fill: '#1e293b' }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Alert severity pie */}
        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Alert Severity Breakdown</h2>
            <span className="text-xs text-slate-600">{alerts?.length ?? 0} total alerts</span>
          </div>
          {alertsLoading ? (
            <div className="h-56 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : severityData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-600 text-sm">
              No alert data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {severityData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => [v, name]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
