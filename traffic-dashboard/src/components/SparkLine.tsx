// src/components/SparkLine.tsx
'use client';

import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { SpeedPoint } from '@/types';

interface Props {
  data: SpeedPoint[];
  height?: number;
}

export function SparkLine({ data, height = 40 }: Props) {
  const { strokeColor, trend } = useMemo(() => {
    if (data.length < 2) {
      return { strokeColor: '#64748b', trend: 'flat' as const };
    }
    const last = data[data.length - 1].speed;
    const prev = data[data.length - 2].speed;
    const diff = last - prev;
    if (diff > 0.5) return { strokeColor: '#60a5fa', trend: 'up' as const };
    if (diff < -0.5) return { strokeColor: '#f87171', trend: 'down' as const };
    return { strokeColor: '#64748b', trend: 'flat' as const };
  }, [data]);

  if (data.length === 0) return null;

  const gradientId = `sparkGrad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="speed"
              stroke={strokeColor}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
      {trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />}
      {trend === 'flat' && <Minus className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
    </div>
  );
}
