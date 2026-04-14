// src/components/CityScore.tsx
'use client';

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

interface Props {
  score: number;
}

function getScoreColor(score: number): string {
  if (score < 40) return '#ef4444';   // red
  if (score < 60) return '#f97316';   // orange
  if (score < 75) return '#eab308';   // yellow
  return '#10b981';                    // emerald
}

function getScoreLabel(score: number): string {
  if (score < 20) return 'Critical';
  if (score < 40) return 'Heavy';
  if (score < 60) return 'Moderate';
  if (score < 80) return 'Good';
  return 'Excellent';
}

export function CityScore({ score }: Props) {
  const cx = 70;
  const cy = 70;
  const r = 55;
  const strokeWidth = 10;
  const circumference = Math.PI * r; // half circumference for semicircle arc

  // We use a semicircle: from leftmost point (-r,0) to rightmost point (r,0)
  // strokeDasharray = circumference, strokeDashoffset animates from circumference (empty) to
  // circumference - (score/100 * circumference)
  const targetOffset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  const dashOffset = useMotionValue(circumference);

  useEffect(() => {
    const controls = animate(dashOffset, targetOffset, {
      duration: 1.4,
      ease: 'easeOut',
    });
    return controls.stop;
  }, [score, targetOffset, dashOffset]);

  return (
    <div className="glass p-6 flex flex-col items-center">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
        City Health Score
      </h2>

      <div className="relative" style={{ width: 140, height: 80 }}>
        <svg width={140} height={80} viewBox="0 0 140 80">
          {/* Background arc */}
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Animated foreground arc */}
          <motion.path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: dashOffset }}
          />
        </svg>

        {/* Center score number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center mt-4">
          <span
            className="text-3xl font-bold font-mono leading-none"
            style={{ color }}
          >
            {score}
          </span>
        </div>
      </div>

      <p
        className="text-sm font-semibold mt-2 leading-none"
        style={{ color }}
      >
        {getScoreLabel(score)}
      </p>
      <p className="text-xs text-slate-600 mt-1">Network health index</p>
    </div>
  );
}
