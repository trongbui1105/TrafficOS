package model

import "time"

type TrafficAnalyzedEvent struct {
	RoadID   string `json:"roadId"`
	RoadName string `json:"roadName"`

	WindowStart time.Time `json:"windowStart"`
	WindowEnd   time.Time `json:"windowEnd"`

	TotalVehicles int     `json:"totalVehicles"`
	AvgSpeed      float64 `json:"avgSpeed"`

	Congested bool `json:"congested"`
}
