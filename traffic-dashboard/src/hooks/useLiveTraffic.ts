// src/hooks/useLiveTraffic.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertEvent, RoadStatus, SpeedPoint, WebSocketMessage } from '@/types';
import { API_BASE, WS_URL } from '@/lib/api';

const MAX_SPEED_HISTORY = 12;

/**
 * Opens a WebSocket connection to /ws/live and returns a live-updated
 * map of road statuses, a list of recent alerts, speed history per road,
 * and a computed city traffic score.
 *
 * On mount it seeds the map from the REST /api/v1/roads endpoint so the
 * page shows data immediately instead of waiting for the next WS push.
 * Reconnects automatically after a 3-second delay if the connection drops.
 */
export function useLiveTraffic() {
  const [roads, setRoads] = useState<Map<string, RoadStatus>>(new Map());
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [speedHistory, setSpeedHistory] = useState<Map<string, SpeedPoint[]>>(new Map());
  const [trafficScore, setTrafficScore] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Compute traffic score whenever roads update
  useEffect(() => {
    if (roads.size === 0) return;
    const scores = Array.from(roads.values()).map(r =>
      Math.min((r.avgSpeed / 50) * 100, 100)
    );
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    setTrafficScore(Math.round(avg));
  }, [roads]);

  // Seed initial road state from REST API so the grid isn't empty on first load
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/roads`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((list: RoadStatus[]) => {
        setRoads((prev) => {
          if (prev.size > 0) return prev;
          const m = new Map<string, RoadStatus>();
          list.forEach((r) => m.set(r.roadId, r));
          return m;
        });
        // Seed initial speed history from REST data
        setSpeedHistory((prev) => {
          if (prev.size > 0) return prev;
          const m = new Map<string, SpeedPoint[]>();
          list.forEach((r) => {
            const point: SpeedPoint = {
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              speed: r.avgSpeed,
            };
            m.set(r.roadId, [point]);
          });
          return m;
        });
      })
      .catch(() => { /* silently ignore — WS will fill in */ });
  }, []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        const msg: WebSocketMessage = JSON.parse(event.data);

        if (msg.type === 'road_update') {
          const status = msg.data as RoadStatus;
          setRoads((prev) => new Map(prev).set(status.roadId, status));

          // Track speed history
          setSpeedHistory((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(status.roadId) ?? [];
            const point: SpeedPoint = {
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              speed: status.avgSpeed,
            };
            const updated = [...existing, point].slice(-MAX_SPEED_HISTORY);
            newMap.set(status.roadId, updated);
            return newMap;
          });
        } else if (msg.type === 'alert') {
          const alert = msg.data as AlertEvent;
          // Keep the 50 most recent alerts
          setAlerts((prev) => [alert, ...prev].slice(0, 50));

          // Fire toast for HIGH severity alerts
          if (alert.severity === 'HIGH') {
            toast(`🔴 HIGH Alert — ${alert.roadName}: ${alert.message}`, {
              duration: 6000,
              style: {
                background: '#0f172a',
                color: '#f1f5f9',
                border: '1px solid #ef4444',
                borderRadius: '12px',
                fontSize: '13px',
                padding: '12px 16px',
                maxWidth: '420px',
              },
              icon: undefined,
            });
          }
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  return { roads, alerts, connected, speedHistory, trafficScore };
}
