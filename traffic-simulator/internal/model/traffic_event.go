package model

import "time"

type TrafficEvent struct {
	// Type of event (useful for future extensions)
	EventType string `json:"eventType"`

	// Technical identifier (stable, used as Kafka key)
	RoadID string `json:"roadId"`

	// Human-readable name (used by UI)
	RoadName string `json:"roadName"`

	// Number of vehicles on the road
	VehicleCount int `json:"vehicleCount"`

	// Average speed (km/h)
	AvgSpeed float64 `json:"avgSpeed"`

	// Event creation time (UTC)
	Timestamp time.Time `json:"timestamp"`
}
