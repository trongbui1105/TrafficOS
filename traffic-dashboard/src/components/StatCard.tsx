// src/components/StatCard.tsx
'use client';

import CountUp from 'react-countup';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'blue' | 'emerald' | 'orange' | 'red' | 'purple' | 'violet';
  icon?: React.ReactNode;
}

const accents = {
  blue:    'text-blue-400',
  emerald: 'text-emerald-400',
  orange:  'text-orange-400',
  red:     'text-red-400',
  purple:  'text-purple-400',
  violet:  'text-violet-400',
};

export function StatCard({ label, value, sub, accent = 'blue', icon }: Props) {
  return (
    <div className="stat-card relative overflow-hidden">
      {icon && (
        <div className="absolute top-4 right-4 opacity-20">
          {icon}
        </div>
      )}
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold font-mono ${accents[accent]}`}>
        {typeof value === 'number' ? (
          <CountUp
            end={value}
            duration={1.5}
            preserveValue
            separator=","
          />
        ) : (
          value
        )}
      </p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
}
