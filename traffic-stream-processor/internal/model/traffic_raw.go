package model

import "time"

// TrafficEvent represents RAW traffic data from simulator.
// This event is high-frequency and append-only.
type TrafficEvent struct {
	// Type of event (reserved for future extensions)
	EventType string `json:"eventType"`

	// Technical identifier (Kafka key, stable)
	RoadID string `json:"roadId"`

	// Human-readable name (UI usage)
	RoadName string `json:"roadName"`

	// Number of vehicles detected
	VehicleCount int `json:"vehicleCount"`

	// Average speed (km/h)
	AvgSpeed float64 `json:"avgSpeed"`

	// Event creation time (UTC, event time)
	Timestamp time.Time `json:"timestamp"`
}
