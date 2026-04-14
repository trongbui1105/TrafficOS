export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export const fetcher = (url: string) =>
  fetch(`${API_BASE}${url}`).then((res) => {
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  });

export const WS_URL =
  (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080') + '/ws/live';
