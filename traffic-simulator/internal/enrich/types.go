package enrich

import "time"

// RoadMeta captures static/semi-static metadata for a road, persisted once
// on startup to the ClickHouse `road_metadata` table.
type RoadMeta struct {
	RoadID     string  `json:"road_id"`
	RoadName   string  `json:"road_name"`
	District   string  `json:"district"`
	RoadType   string  `json:"road_type"` // highway|arterial|collector|local
	Lanes      int     `json:"lanes"`
	SpeedLimit int     `json:"speed_limit"`
	LengthKm   float64 `json:"length_km"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
	UpdatedAt  string  `json:"updated_at"`
}

// Weather holds a point-in-time weather reading for a road.
type Weather struct {
	RoadID       string  `json:"road_id"`
	ObservedAt   string  `json:"observed_at"`
	Condition    string  `json:"condition"` // clear|cloudy|rain|heavy_rain|fog|storm|haze
	TemperatureC float32 `json:"temperature_c"`
	HumidityPct  int     `json:"humidity_pct"`
	WindKph      float32 `json:"wind_kph"`
	VisibilityKm float32 `json:"visibility_km"`
	RainMm       float32 `json:"rain_mm"`
}

// Incident represents an operational event on a road (accident, roadwork…).
// The same incident_id is upserted as status transitions from active→resolved.
type Incident struct {
	IncidentID   string  `json:"incident_id"`
	RoadID       string  `json:"road_id"`
	RoadName     string  `json:"road_name"`
	Type         string  `json:"type"`
	Severity     string  `json:"severity"`
	Status       string  `json:"status"`
	LanesBlocked int     `json:"lanes_blocked"`
	Description  string  `json:"description"`
	StartedAt    string  `json:"started_at"`
	EndedAt      *string `json:"ended_at"`
	UpdatedAt    string  `json:"updated_at"`
}

// Environment captures air-quality + noise metrics for a road.
type Environment struct {
	RoadID     string  `json:"road_id"`
	ObservedAt string  `json:"observed_at"`
	PM25       float32 `json:"pm25"`
	PM10       float32 `json:"pm10"`
	NO2        float32 `json:"no2"`
	COPpm      float32 `json:"co_ppm"`
	AQI        int     `json:"aqi"`
	NoiseDb    float32 `json:"noise_db"`
}

// VehicleMix breaks a road's vehicle count down by class.
type VehicleMix struct {
	RoadID      string `json:"road_id"`
	ObservedAt  string `json:"observed_at"`
	Cars        int    `json:"cars"`
	Trucks      int    `json:"trucks"`
	Buses       int    `json:"buses"`
	Motorcycles int    `json:"motorcycles"`
	Bicycles    int    `json:"bicycles"`
	Emergency   int    `json:"emergency"`
	Pedestrians int    `json:"pedestrians"`
}

// FormatTime renders a time in ClickHouse DateTime format (UTC).
func FormatTime(t time.Time) string {
	return t.UTC().Format("2006-01-02 15:04:05")
}
