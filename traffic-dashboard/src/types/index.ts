// src/types/index.ts

export interface RoadStatus {
  roadId: string;
  roadName: string;
  totalVehicles: number;
  avgSpeed: number;
  congested: boolean;
  updatedAt: string;
}

export interface RoadHistory {
  roadId: string;
  roadName: string;
  windowStart: string;
  windowEnd: string;
  totalVehicles: number;
  avgSpeed: number;
  congested: boolean;
}

export interface AlertEvent {
  roadId: string;
  roadName: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  triggeredAt: string;
}

export type WebSocketMessageType = 'road_update' | 'alert';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: RoadStatus | AlertEvent;
}

export interface SpeedPoint {
  time: string;
  speed: number;
}

// --- Enrichment datasets (City Pulse) ------------------------------------

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'fog'
  | 'storm'
  | 'haze';

export interface IncidentRecord {
  incidentId: string;
  roadId: string;
  roadName: string;
  type: 'accident' | 'roadwork' | 'breakdown' | 'protest' | 'flood' | 'event' | 'debris';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'active' | 'resolved';
  lanesBlocked: number;
  description: string;
  startedAt: string;
}

export interface DistrictSnapshot {
  district: string;
  roadCount: number;
  avgSpeed: number;
  avgAqi: number;
  activeIncidents: number;
}

// --- ML Prediction types (traffic-predictor) ---------------------------------

export interface SpeedForecast {
  timestamp: string;
  predictedAvgSpeed: number;
  lowerBound: number;
  upperBound: number;
  congestionProbability: number;
}

export interface RoadPrediction {
  roadId: string;
  roadName: string;
  generatedAt: string;
  currentAvgSpeed: number | null;
  currentCongested: boolean | null;
  next30min: SpeedForecast[];
  next1h: SpeedForecast[];
  historicalMean: number;
  historicalStd: number;
  trendDirection: 'rising' | 'falling' | 'stable';
  confidence: 'low' | 'medium' | 'high';
}

export interface AnomalyRecord {
  roadId: string;
  roadName: string;
  detectedAt: string;
  currentSpeed: number;
  expectedSpeed: number;
  deviationSigma: number;
  anomalyType: 'slow_anomaly' | 'fast_anomaly';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface CityForecast {
  generatedAt: string;
  next30minCongestionPct: number;
  next1hCongestionPct: number;
  peakRoads: string[];
  improvingRoads: string[];
  cityAvgSpeedNow: number;
  cityAvgSpeed30min: number;
  cityAvgSpeed1h: number;
}

export interface CityPulse {
  generatedAt: string;
  activeIncidentsByType: Record<string, number>;
  activeIncidents: IncidentRecord[];
  weatherMix: Record<WeatherCondition, number>;
  weather: {
    avgTemperatureC: number;
    avgHumidityPct: number;
    avgWindKph: number;
    avgVisibilityKm: number;
    totalRainMm: number;
  };
  environment: {
    avgPm25: number;
    avgPm10: number;
    avgNo2: number;
    avgCoPpm: number;
    avgAqi: number;
    avgNoiseDb: number;
    airQualityLabel: string;
  };
  vehicles: {
    cars: number;
    trucks: number;
    buses: number;
    motorcycles: number;
    bicycles: number;
    emergency: number;
    pedestrians: number;
  };
  districts: DistrictSnapshot[];
}
