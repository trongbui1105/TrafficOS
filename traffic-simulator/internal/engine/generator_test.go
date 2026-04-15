package engine

import (
	"testing"
	"time"

	"traffic-simulator/internal/config"
)

func TestTimeMultiplier(t *testing.T) {
	cases := []struct {
		name string
		hour int
		want float64
	}{
		{"morning rush", 7, 1.6},
		{"lunch peak", 12, 1.3},
		{"evening rush", 18, 1.8},
		{"late night", 23, 0.4},
		{"early morning", 3, 0.4},
		{"normal daytime", 15, 1.0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// Build a time at that hour today
			now := time.Now()
			at := time.Date(now.Year(), now.Month(), now.Day(), c.hour, 0, 0, 0, time.Local)
			if got := timeMultiplier(at); got != c.want {
				t.Errorf("timeMultiplier(hour=%d) = %v, want %v", c.hour, got, c.want)
			}
		})
	}
}

func TestGenerateEvent_BasicInvariants(t *testing.T) {
	gen := NewGenerator()
	road := config.RoadConfig{
		RoadID:       "R001",
		RoadName:     "Test Road",
		BaseCapacity: 200,
		SpeedLimit:   60,
	}

	// Run many iterations to validate the clamping invariants hold.
	for i := 0; i < 500; i++ {
		evt := gen.GenerateEvent(road)
		if evt.RoadID != road.RoadID {
			t.Errorf("RoadID mismatch: %s", evt.RoadID)
		}
		if evt.RoadName != road.RoadName {
			t.Errorf("RoadName mismatch: %s", evt.RoadName)
		}
		if evt.EventType != "TRAFFIC_DENSITY" {
			t.Errorf("EventType wrong: %s", evt.EventType)
		}
		if evt.AvgSpeed < 5 {
			t.Errorf("speed below floor: %v", evt.AvgSpeed)
		}
		if evt.AvgSpeed > float64(road.SpeedLimit) {
			t.Errorf("speed above limit: %v > %d", evt.AvgSpeed, road.SpeedLimit)
		}
		if evt.VehicleCount < 0 {
			t.Errorf("negative vehicle count: %d", evt.VehicleCount)
		}
		if evt.Timestamp.IsZero() {
			t.Error("timestamp not set")
		}
	}
}

func TestNewGenerator_UsesSeededRNG(t *testing.T) {
	g := NewGenerator()
	if g == nil || g.rng == nil {
		t.Fatal("generator should have initialized RNG")
	}
	if g.state != nil {
		t.Error("state should be nil until WithState is called")
	}
}
