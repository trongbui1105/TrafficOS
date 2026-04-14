import clsx from 'clsx';

interface Props {
  avgSpeed: number;
  congested: boolean;
}

function getLevel(speed: number) {
  if (speed < 10) return { label: 'Severe',  color: 'bg-red-500/20 text-red-400 ring-red-500/30' };
  if (speed < 20) return { label: 'Heavy',   color: 'bg-orange-500/20 text-orange-400 ring-orange-500/30' };
  if (speed < 30) return { label: 'Slow',    color: 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/30' };
  return            { label: 'Flowing', color: 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30' };
}

export function CongestionBadge({ avgSpeed }: Props) {
  const { label, color } = getLevel(avgSpeed);
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1',
      color
    )}>
      {label}
    </span>
  );
}
