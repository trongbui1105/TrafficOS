/**
 * Safely coerce any value that may arrive as null / undefined / "NaN" from
 * the API into a finite JS number before calling .toFixed().
 *
 * ClickHouse avg() of 0 rows emits IEEE NaN → Java Double.NaN → Jackson "NaN"
 * (string). Python FastAPI with None fields → JSON null → JS undefined/null.
 * Both break .toFixed().  This helper normalises all those cases to 0.
 */
export function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/** Format a speed value safely — returns '—' when the value is nullish. */
export function fmtSpeed(v: unknown, decimals = 1): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return isFinite(n) ? `${n.toFixed(decimals)} km/h` : '—';
}

/** Format a percentage safely — returns '—' when the value is nullish. */
export function fmtPct(v: unknown, decimals = 1): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return isFinite(n) ? `${n.toFixed(decimals)}%` : '—';
}
