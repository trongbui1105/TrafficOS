# API Reference

Base URL: `http://localhost:8080`

All REST endpoints return `Content-Type: application/json`. CORS is open (`*`).

---

## Traffic — Current State

### `GET /api/v1/roads`
All roads' current state from Redis (latest window, TTL 60s).

**Response:** `RoadStatus[]`
```json
[
  {
    "roadId": "R001",
    "roadName": "Nguyen Hue Boulevard",
    "totalVehicles": 143,
    "avgSpeed": 22.4,
    "congested": false,
    "updatedAt": "2026-04-10T14:00:00Z"
  }
]
```

---

### `GET /api/v1/roads/{id}`
Single road current state.

**Params:** `id` — road ID (e.g. `R001`)
**Response:** `RoadStatus` or `404`

---

### `GET /api/v1/roads/meta`
Static metadata for all roads from `road_metadata` ClickHouse table.

**Response:** `RoadMeta[]`
```json
[
  {
    "roadId": "R001",
    "roadName": "Nguyen Hue Boulevard",
    "district": "District 3",
    "roadType": "arterial",
    "lanes": 4,
    "speedLimit": 40,
    "lengthKm": 4.1,
    "lat": 10.7846,
    "lon": 106.7182
  }
]
```

---

## Traffic — Historical

### `GET /api/v1/roads/{id}/history`
30-second windowed speed + vehicle data from `traffic_analyzed`.

**Query params:**
| Param | Default | Format |
|---|---|---|
| `from` | now − 1h | ISO-8601 instant |
| `to` | now | ISO-8601 instant |

**Response:** `RoadHistory[]`
```json
[
  {
    "roadId": "R001",
    "roadName": "Nguyen Hue Boulevard",
    "windowStart": "2026-04-10T13:00:00Z",
    "windowEnd": "2026-04-10T13:00:30Z",
    "totalVehicles": 187,
    "avgSpeed": 14.2,
    "congested": true
  }
]
```

---

### `GET /api/v1/roads/{id}/analytics`
Hourly aggregates for the last 24 hours (bucketed with `toStartOfHour`).

**Response:** `RoadHistory[]` (same shape, `windowEnd = windowStart + 1h`)

---

## Alerts

### `GET /api/v1/alerts`
Recent congestion alerts from `traffic_alerts`, newest first.

**Query params:**
| Param | Default |
|---|---|
| `limit` | 50 |

**Response:** `AlertEvent[]`
```json
[
  {
    "roadId": "R042",
    "roadName": "Nguyen Kim Street",
    "severity": "HIGH",
    "message": "Severe congestion on Nguyen Kim Street: avg speed 8.2 km/h",
    "triggeredAt": "2026-04-10T14:01:23Z"
  }
]
```

---

## Enrichment — Weather

### `GET /api/v1/weather`
Latest weather observation per road (last 10 minutes window).

**Response:** `WeatherObservation[]`
```json
[
  {
    "roadId": "R001",
    "observedAt": "2026-04-10T14:12:38Z",
    "condition": "cloudy",
    "temperatureC": 31.6,
    "humidityPct": 67,
    "windKph": 13.4,
    "visibilityKm": 8.4,
    "rainMm": 0.0
  }
]
```

**Conditions:** `clear` | `cloudy` | `rain` | `heavy_rain` | `fog` | `storm` | `haze`

---

### `GET /api/v1/roads/{id}/weather`
Latest weather for a single road.

**Response:** `WeatherObservation` or `404`

---

## Enrichment — Incidents

### `GET /api/v1/incidents/active`
Currently active incidents, ordered by severity desc then newest.

**Query params:**
| Param | Default |
|---|---|
| `limit` | 100 |

**Response:** `IncidentRecord[]`
```json
[
  {
    "incidentId": "INC-1775830608-000016",
    "roadId": "R056",
    "roadName": "Huynh Tan Phat Street",
    "type": "breakdown",
    "severity": "HIGH",
    "status": "active",
    "lanesBlocked": 3,
    "description": "Stalled bus in curb lane",
    "startedAt": "2026-04-10T14:16:48Z"
  }
]
```

**Incident types:** `accident` | `roadwork` | `breakdown` | `protest` | `flood` | `event` | `debris`

---

## Enrichment — Environment

### `GET /api/v1/roads/{id}/environment`
Air quality and noise history for a road.

**Query params:**
| Param | Default |
|---|---|
| `limit` | 60 |

**Response:** `EnvironmentMetric[]`
```json
[
  {
    "roadId": "R001",
    "observedAt": "2026-04-10T14:10:55Z",
    "pm25": 48.6,
    "pm10": 79.5,
    "no2": 63.1,
    "coPpm": 1.66,
    "aqi": 102,
    "noiseDb": 70.9
  }
]
```

**AQI labels:**
| Range | Label |
|---|---|
| 0–50 | Good |
| 51–100 | Moderate |
| 101–150 | Unhealthy for Sensitive Groups |
| 151–200 | Unhealthy |
| 201–300 | Very Unhealthy |
| 301+ | Hazardous |

---

## Enrichment — Vehicle Classification

### `GET /api/v1/roads/{id}/vehicle-mix`
Vehicle class breakdown history for a road.

**Query params:**
| Param | Default |
|---|---|
| `limit` | 60 |

**Response:** `VehicleMix[]`
```json
[
  {
    "roadId": "R001",
    "observedAt": "2026-04-10T14:10:55Z",
    "cars": 31,
    "trucks": 7,
    "buses": 7,
    "motorcycles": 84,
    "bicycles": 2,
    "emergency": 0,
    "pedestrians": 47
  }
]
```

---

## City Pulse

### `GET /api/v1/city/pulse`
Aggregated city-wide snapshot combining all enrichment datasets. Designed for the "City Pulse" dashboard page.

**Response:** `CityPulse`
```json
{
  "generatedAt": "2026-04-10T14:16:49Z",
  "activeIncidentsByType": {
    "accident": 2,
    "roadwork": 1
  },
  "activeIncidents": [ ...IncidentRecord[] ],
  "weatherMix": {
    "clear": 21,
    "haze": 14,
    "storm": 9,
    "rain": 8
  },
  "weather": {
    "avgTemperatureC": 30.2,
    "avgHumidityPct": 67.5,
    "avgWindKph": 15.5,
    "avgVisibilityKm": 6.3,
    "totalRainMm": 399.6
  },
  "environment": {
    "avgPm25": 45.9,
    "avgPm10": 76.1,
    "avgNo2": 57.5,
    "avgCoPpm": 1.46,
    "avgAqi": 96,
    "avgNoiseDb": 69.7,
    "airQualityLabel": "Moderate"
  },
  "vehicles": {
    "cars": 1886,
    "trucks": 298,
    "buses": 392,
    "motorcycles": 7327,
    "bicycles": 216,
    "emergency": 1,
    "pedestrians": 2574
  },
  "districts": [
    {
      "district": "District 1",
      "roadCount": 12,
      "avgSpeed": 18.4,
      "avgAqi": 88,
      "activeIncidents": 1
    }
  ]
}
```

---

## WebSocket — Live Feed

### `WS /ws/live`
Bi-directional WebSocket. Server pushes two message types:

```json
{ "type": "road_update", "data": {
    "roadId": "R001", "roadName": "...",
    "totalVehicles": 187, "avgSpeed": 14.2,
    "congested": true, "updatedAt": "2026-04-10T14:00:30Z"
}}

{ "type": "alert", "data": {
    "roadId": "R042", "roadName": "...",
    "severity": "HIGH",
    "message": "Severe congestion...",
    "triggeredAt": "2026-04-10T14:01:23Z"
}}
```

Client can send any frame to keep-alive (pong is implicit). Disconnect and reconnect is handled by the client hook (`useLiveTraffic`) with 3s retry.
