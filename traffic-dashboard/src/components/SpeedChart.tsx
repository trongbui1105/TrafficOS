'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { RoadHistory } from '@/types';

interface Props {
  data: RoadHistory[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: <span className="font-semibold">{p.value?.toFixed ? p.value.toFixed(1) : p.value}</span>
          {p.name === 'Speed' ? ' km/h' : ''}
        </p>
      ))}
    </div>
  );
};

export function SpeedChart({ data }: Props) {
  const chartData = data.map((row) => ({
    time: new Date(row.windowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    Speed: parseFloat(row.avgSpeed.toFixed(1)),
    Vehicles: row.totalVehicles,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="vehicleGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85 / 0.8)" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 10, fill: '#64748b' }}
          axisLine={{ stroke: '#1e293b' }}
          tickLine={false}
        />
        <YAxis
          yAxisId="speed"
          domain={[0, 80]}
          tick={{ fontSize: 10, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="vehicles"
          orientation="right"
          tick={{ fontSize: 10, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }}
        />
        {/* Congestion threshold */}
        <ReferenceLine
          yAxisId="speed"
          y={20}
          stroke="#f97316"
          strokeDasharray="5 5"
          strokeOpacity={0.7}
          label={{ value: 'Congestion threshold', fill: '#f97316', fontSize: 10, position: 'insideTopRight' }}
        />
        <Area
          yAxisId="speed"
          type="monotone"
          dataKey="Speed"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#speedGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#3b82f6', stroke: '#1e3a5f', strokeWidth: 2 }}
        />
        <Area
          yAxisId="vehicles"
          type="monotone"
          dataKey="Vehicles"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#vehicleGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#10b981', stroke: '#064e3b', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
