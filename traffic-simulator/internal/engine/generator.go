package engine

import (
	"math/rand"
	"time"

	"traffic-simulator/internal/config"
	"traffic-simulator/internal/model"
)

// Generator owns its own random source (no global rand)
type Generator struct {
	rng *rand.Rand
}

func NewGenerator() *Generator {
	return &Generator{
		rng: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (g *Generator) GenerateEvent(road config.RoadConfig) model.TrafficEvent {
	// Time-based traffic multiplier (rush hour, night, etc.)
	multiplier := timeMultiplier(time.Now())

	// Calculate vehicle count with randomness
	vehicleCount := int(
		float64(road.BaseCapacity) *
			multiplier *
			rand.Float64(),
	)

	// Simple congestion model:
	// more vehicles => slower speed
	speed := float64(road.SpeedLimit) *
		(1 - float64(vehicleCount)/float64(road.BaseCapacity))

	// Clamp speed to realistic bounds
	if speed < 5 {
		speed = 5
	}

	if speed > float64(road.SpeedLimit) {
		speed = float64(road.SpeedLimit)
	}

	return model.TrafficEvent{
		EventType:    "TRAFFIC_DENSITY",
		RoadID:       road.RoadID,
		RoadName:     road.RoadName,
		VehicleCount: vehicleCount,
		AvgSpeed:     speed,
		Timestamp:    time.Now().UTC(),
	}
}

func timeMultiplier(t time.Time) float64 {
	h := t.Hour()

	switch {
	case h >= 6 && h < 9:
		return 1.6
	case h >= 11 && h < 13:
		return 1.3
	case h >= 17 && h < 20:
		return 1.8
	case h >= 22 || h < 5:
		return 0.4
	default:
		return 1.0
	}
}
