// src/components/TrafficMap.tsx
'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { RoadStatus } from '@/types';

// Fix Leaflet default icon issue in Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Props {
  roads: Map<string, RoadStatus>;
  coordinates: Record<string, [number, number]>;
}

function speedMarkerColor(speed: number): string {
  if (speed < 10) return '#ef4444';   // red
  if (speed < 20) return '#f97316';   // orange
  if (speed < 30) return '#eab308';   // yellow
  return '#10b981';                    // emerald
}

function markerRadius(totalVehicles: number): number {
  return Math.min(20, 10 + Math.floor(totalVehicles / 50));
}

function congestionLabel(speed: number): string {
  if (speed < 10) return 'Severe';
  if (speed < 20) return 'Heavy';
  if (speed < 30) return 'Slow';
  return 'Flowing';
}

export default function TrafficMap({ roads, coordinates }: Props) {
  useEffect(() => {
    // Ensure Leaflet CSS variables are set correctly on mount
  }, []);

  return (
    <MapContainer
      center={[10.7769, 106.7009]}
      zoom={13}
      style={{ height: '100%', width: '100%', background: '#0f172a', minHeight: 500 }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />

      {Array.from(roads.values()).map(road => {
        const coords = coordinates[road.roadId];
        if (!coords) return null;
        const color = speedMarkerColor(road.avgSpeed);
        const radius = markerRadius(road.totalVehicles);

        return (
          <CircleMarker
            key={road.roadId}
            center={coords}
            radius={radius}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: color,
              fillOpacity: 0.8,
            }}
          >
            <Popup
              className="traffic-popup"
              closeButton={false}
              maxWidth={220}
            >
              <div style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '12px 14px',
                color: '#f1f5f9',
                fontFamily: 'Inter, sans-serif',
                minWidth: 180,
              }}>
                <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginBottom: 2 }}>
                  {road.roadId}
                </p>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#f1f5f9' }}>
                  {road.roadName}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Speed</span>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color }}>
                    {road.avgSpeed.toFixed(1)} km/h
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Vehicles</span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#e2e8f0' }}>
                    {road.totalVehicles}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Status</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color,
                    background: `${color}20`,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}>
                    {congestionLabel(road.avgSpeed)}
                  </span>
                </div>
                <a
                  href={`/roads/${road.roadId}`}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#60a5fa',
                    textDecoration: 'none',
                    padding: '5px 0',
                    borderTop: '1px solid #1e293b',
                    marginTop: 6,
                  }}
                >
                  View details →
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
