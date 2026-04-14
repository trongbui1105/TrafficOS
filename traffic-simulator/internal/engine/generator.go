package engine

import (
	"math/rand"
	"time"

	"traffic-simulator/internal/config"
	"traffic-simulator/internal/enrich"
	"traffic-simulator/internal/model"
)

// Generator owns its own random source (no global rand). When a State is
// attached, the generator consults it so that simulated traffic responds to
// the current weather and any active incidents on each road.
type Generator struct {
	rng   *rand.Rand
	state *enrich.State
}

func NewGenerator() *Generator {
	return &Generator{
		rng: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// WithState attaches a live simulation state to the generator, enabling
// weather- and incident-aware speed computation.
func (g *Generator) WithState(s *enrich.State) *Generator {
	g.state = s
	return g
}

func (g *Generator) GenerateEvent(road config.RoadConfig) model.TrafficEvent {
	// Time-based traffic multiplier (rush hour, night, etc.)
	multiplier := timeMultiplier(time.Now())

	// Calculate vehicle count with randomness
	vehicleCount := int(
		float64(road.BaseCapacity) *
			multiplier *
			g.rng.Float64(),
	)

	// Simple congestion model: more vehicles => slower speed.
	speed := float64(road.SpeedLimit) *
		(1 - float64(vehicleCount)/float64(road.BaseCapacity))

	// Apply weather modifier (rain/fog/storm slow traffic).
	if g.state != nil {
		speed *= g.state.SpeedFactorFor(road.RoadID)
		// Each active incident on this road chops another 15% off.
		if n := g.state.ActiveIncidentCountFor(road.RoadID); n > 0 {
			factor := 1.0
			for i := 0; i < n; i++ {
				factor *= 0.85
			}
			speed *= factor
		}
	}

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
