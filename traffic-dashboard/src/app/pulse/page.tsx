// src/app/pulse/page.tsx
'use client';

import useSWR from 'swr';
import { motion } from 'framer-motion';
import {
  Cloud, CloudRain, CloudFog, CloudLightning, Sun, Wind, Droplets,
  Activity, AlertTriangle, Car, Truck, Bus, Bike, Siren, Users, Volume2,
  MapPin,
} from 'lucide-react';
import { fetcher } from '@/lib/api';
import { num } from '@/lib/fmt';
import type { CityPulse, WeatherCondition, IncidentRecord } from '@/types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { formatDistanceToNowStrict } from 'date-fns';

const WEATHER_ICON: Record<WeatherCondition, typeof Sun> = {
  clear: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  heavy_rain: CloudRain,
  fog: CloudFog,
  storm: CloudLightning,
  haze: CloudFog,
};

const WEATHER_COLOR: Record<WeatherCondition, string> = {
  clear: 'text-amber-400',
  cloudy: 'text-slate-400',
  rain: 'text-sky-400',
  heavy_rain: 'text-blue-500',
  fog: 'text-slate-500',
  storm: 'text-purple-500',
  haze: 'text-yellow-600',
};

const SEVERITY_COLOR: Record<IncidentRecord['severity'], string> = {
  LOW: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  HIGH: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const INCIDENT_EMOJI: Record<string, string> = {
  accident: '💥', roadwork: '🚧', breakdown: '🛠️', protest: '📢',
  flood: '🌊', event: '🎉', debris: '🪵',
};

function aqiColor(aqi: number): string {
  if (aqi <= 50)  return 'text-emerald-400';
  if (aqi <= 100) return 'text-yellow-400';
  if (aqi <= 150) return 'text-orange-400';
  if (aqi <= 200) return 'text-red-400';
  if (aqi <= 300) return 'text-purple-400';
  return 'text-fuchsia-500';
}

function aqiBg(aqi: number): string {
  if (aqi <= 50)  return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30';
  if (aqi <= 100) return 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30';
  if (aqi <= 150) return 'from-orange-500/20 to-orange-500/5 border-orange-500/30';
  if (aqi <= 200) return 'from-red-500/20 to-red-500/5 border-red-500/30';
  return 'from-purple-500/20 to-purple-500/5 border-purple-500/30';
}

const VEHICLE_COLORS = ['#60a5fa', '#f59e0b', '#10b981', '#a855f7', '#ec4899', '#ef4444', '#94a3b8'];

export default function CityPulsePage() {
  const { data, isLoading, error } = useSWR<CityPulse>('/api/v1/city/pulse', fetcher, {
    refreshInterval: 10_000,
  });

  if (error) {
    return <div className="text-red-400">Failed to load city pulse: {error.message}</div>;
  }
  if (isLoading || !data) {
    return <div className="text-slate-500 text-sm animate-pulse">Loading city pulse…</div>;
  }

  // Derived data
  const weatherSlices = Object.entries(data.weatherMix).map(([k, v]) => ({ name: k, value: v }));
  const vehicleSlices = [
    { name: 'Motorcycles', value: data.vehicles.motorcycles },
    { name: 'Cars',        value: data.vehicles.cars },
    { name: 'Buses',       value: data.vehicles.buses },
    { name: 'Trucks',      value: data.vehicles.trucks },
    { name: 'Bicycles',    value: data.vehicles.bicycles },
    { name: 'Emergency',   value: data.vehicles.emergency },
    { name: 'Pedestrians', value: data.vehicles.pedestrians },
  ];
  const totalActive = data.activeIncidents.length;
  const avgSpeedCity =
    data.districts.length === 0
      ? 0
      : data.districts.reduce((s, d) => s + (d.avgSpeed || 0), 0) / data.districts.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <p className="text-xs font-mono text-slate-500 mb-1">CITY PULSE</p>
        <h1 className="text-2xl font-bold text-slate-100">Ho Chi Minh City · Real-time Intelligence</h1>
        <p className="text-xs text-slate-600 mt-1">
          Snapshot generated {formatDistanceToNowStrict(new Date(data.generatedAt), { addSuffix: true })}
        </p>
      </div>

      {/* Headline KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Air Quality */}
        <div className={`glass p-5 bg-gradient-to-br border ${aqiBg(data.environment.avgAqi)}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Air Quality</span>
            <Wind className="w-4 h-4 text-slate-500" />
          </div>
          <div className={`text-4xl font-bold font-mono ${aqiColor(data.environment.avgAqi)}`}>
            {data.environment.avgAqi}
          </div>
          <div className="text-xs text-slate-400 mt-1">{data.environment.airQualityLabel}</div>
          <div className="mt-3 text-[10px] text-slate-500 space-y-0.5 font-mono">
            <div>PM2.5 · {num(data.environment.avgPm25).toFixed(1)} µg/m³</div>
            <div>NO₂ · {num(data.environment.avgNo2).toFixed(1)} ppb</div>
          </div>
        </div>

        {/* Weather */}
        <div className="glass p-5 bg-gradient-to-br from-sky-500/10 to-sky-500/5 border border-sky-500/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Weather</span>
            <Cloud className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-4xl font-bold font-mono text-sky-300">
            {num(data.weather.avgTemperatureC).toFixed(1)}°
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {Object.entries(data.weatherMix).sort((a, b) => b[1] - a[1])[0]?.[0]} dominant
          </div>
          <div className="mt-3 text-[10px] text-slate-500 space-y-0.5 font-mono">
            <div>Humidity · {num(data.weather.avgHumidityPct).toFixed(0)}%</div>
            <div>Wind · {num(data.weather.avgWindKph).toFixed(1)} kph</div>
          </div>
        </div>

        {/* Active incidents */}
        <div className="glass p-5 bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Active Incidents</span>
            <AlertTriangle className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-4xl font-bold font-mono text-red-400">{totalActive}</div>
          <div className="text-xs text-slate-400 mt-1">
            {Object.keys(data.activeIncidentsByType).length} types in progress
          </div>
          <div className="mt-3 text-[10px] text-slate-500 space-y-0.5 font-mono">
            {Object.entries(data.activeIncidentsByType).slice(0, 2).map(([k, v]) => (
              <div key={k}>{INCIDENT_EMOJI[k] ?? '•'} {k} · {v}</div>
            ))}
          </div>
        </div>

        {/* Noise + avg speed */}
        <div className="glass p-5 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Noise / Flow</span>
            <Volume2 className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-4xl font-bold font-mono text-purple-300">
            {num(data.environment.avgNoiseDb).toFixed(0)} <span className="text-xl">dB</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">City-wide avg</div>
          <div className="mt-3 text-[10px] text-slate-500 space-y-0.5 font-mono">
            <div>Avg speed · {num(avgSpeedCity).toFixed(1)} km/h</div>
            <div>CO · {num(data.environment.avgCoPpm).toFixed(2)} ppm</div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weather mix + Vehicle mix (col span 2) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Weather mix donut + conditions table */}
          <div className="glass p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">Weather Distribution</h2>
              <span className="text-[10px] text-slate-600 font-mono">
                {Object.values(data.weatherMix).reduce((a, b) => a + b, 0)} sensors
              </span>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={weatherSlices}
                      cx="50%" cy="50%"
                      innerRadius={45} outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {weatherSlices.map((s, i) => (
                        <Cell key={s.name} fill={VEHICLE_COLORS[i % VEHICLE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                {Object.entries(data.weatherMix).map(([cond, n]) => {
                  const Icon = WEATHER_ICON[cond as WeatherCondition] ?? Sun;
                  return (
                    <div key={cond} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${WEATHER_COLOR[cond as WeatherCondition]}`} />
                        <span className="text-slate-300 capitalize">{cond.replace('_', ' ')}</span>
                      </div>
                      <span className="font-mono text-slate-500">{n} roads</span>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-slate-800 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Droplets className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-slate-400">Rain total</span>
                    </div>
                    <span className="font-mono text-sky-300">{num(data.weather.totalRainMm).toFixed(0)} mm</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle mix */}
          <div className="glass p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">Vehicle Class Mix (live)</h2>
              <span className="text-[10px] text-slate-600 font-mono">Latest per-road snapshot</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <VehicleStat icon={Car}      label="Cars"        value={data.vehicles.cars}        color="text-blue-400" />
              <VehicleStat icon={Bike}     label="Motorcycles" value={data.vehicles.motorcycles} color="text-amber-400" />
              <VehicleStat icon={Bus}      label="Buses"       value={data.vehicles.buses}       color="text-emerald-400" />
              <VehicleStat icon={Truck}    label="Trucks"      value={data.vehicles.trucks}      color="text-purple-400" />
              <VehicleStat icon={Bike}     label="Bicycles"    value={data.vehicles.bicycles}    color="text-pink-400" />
              <VehicleStat icon={Siren}    label="Emergency"   value={data.vehicles.emergency}   color="text-red-400" />
              <VehicleStat icon={Users}    label="Pedestrians" value={data.vehicles.pedestrians} color="text-slate-300" />
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicleSlices} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" stroke="#475569" fontSize={10} />
                  <YAxis type="category" dataKey="name" stroke="#475569" fontSize={10} width={80} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {vehicleSlices.map((_, i) => (
                      <Cell key={i} fill={VEHICLE_COLORS[i % VEHICLE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* District heatmap table */}
          <div className="glass p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">District Breakdown</h2>
              <span className="text-[10px] text-slate-600 font-mono">{data.districts.length} districts</span>
            </div>
            <div className="overflow-x-auto custom-scroll">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left pb-2 font-medium">District</th>
                    <th className="text-right pb-2 font-medium">Roads</th>
                    <th className="text-right pb-2 font-medium">Avg Speed</th>
                    <th className="text-right pb-2 font-medium">AQI</th>
                    <th className="text-right pb-2 font-medium">Incidents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {data.districts.map((d) => (
                    <tr key={d.district} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 text-slate-200 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-slate-600" />
                        {d.district}
                      </td>
                      <td className="py-2 text-right font-mono text-slate-400">{d.roadCount}</td>
                      <td className="py-2 text-right font-mono">
                        <span className={d.avgSpeed >= 25 ? 'text-emerald-400' : d.avgSpeed >= 15 ? 'text-amber-400' : 'text-red-400'}>
                          {d.avgSpeed ? num(d.avgSpeed).toFixed(1) : '—'}
                        </span>
                        <span className="text-slate-600 ml-1">km/h</span>
                      </td>
                      <td className={`py-2 text-right font-mono ${aqiColor(d.avgAqi)}`}>{d.avgAqi || '—'}</td>
                      <td className="py-2 text-right font-mono">
                        {d.activeIncidents > 0 ? (
                          <span className="text-red-400">{d.activeIncidents}</span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Active incident feed (right column) */}
        <div className="glass p-6 h-fit lg:sticky lg:top-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-400" />
              Active Incidents
            </h2>
            <span className="text-[10px] text-slate-600 font-mono">{totalActive}</span>
          </div>
          {data.activeIncidents.length === 0 ? (
            <div className="text-xs text-slate-600 text-center py-8">
              All clear — no active incidents 🎉
            </div>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto custom-scroll pr-1">
              {data.activeIncidents.map((inc) => (
                <motion.div
                  key={inc.incidentId}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-slate-500">{inc.roadId}</span>
                    <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${SEVERITY_COLOR[inc.severity]}`}>
                      {inc.severity}
                    </span>
                  </div>
                  <div className="text-xs text-slate-200 font-medium mb-1">
                    {INCIDENT_EMOJI[inc.type] ?? '•'} {inc.roadName}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-snug">{inc.description}</div>
                  <div className="text-[10px] text-slate-600 font-mono mt-1.5 flex items-center justify-between">
                    <span>{inc.lanesBlocked} lane{inc.lanesBlocked !== 1 ? 's' : ''} blocked</span>
                    <span>{formatDistanceToNowStrict(new Date(inc.startedAt), { addSuffix: true })}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------- small subcomponents ----------

function VehicleStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Car;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="text-lg font-bold font-mono text-slate-100">{value.toLocaleString()}</div>
    </div>
  );
}
