package processor

import (
	"sync"
	"time"
	"traffic-stream-processor/internal/model"
)

type WindowKey struct {
	RoadID      string
	WindowStart time.Time
}

type WindowAgg struct {
	RoadName   string
	VehicleSum int
	SpeedSum   float64
	Count      int
}

type Aggregator struct {
	mu      sync.Mutex
	windows map[WindowKey]*WindowAgg
	window  time.Duration
}

func NewAggregator(window time.Duration) *Aggregator {
	return &Aggregator{
		windows: make(map[WindowKey]*WindowAgg),
		window:  window,
	}
}

func (a *Aggregator) Add(event model.TrafficEvent) {
	a.mu.Lock()
	defer a.mu.Unlock()

	windowStart := event.Timestamp.Truncate(a.window)
	key := WindowKey{
		RoadID:      event.RoadID,
		WindowStart: windowStart,
	}

	if _, ok := a.windows[key]; !ok {
		a.windows[key] = &WindowAgg{
			RoadName: event.RoadName,
		}
	}

	agg := a.windows[key]
	agg.VehicleSum += event.VehicleCount
	agg.SpeedSum += event.AvgSpeed
	agg.Count++
}

func (a *Aggregator) Flush(now time.Time) []model.TrafficAnalyzedEvent {
	a.mu.Lock()
	defer a.mu.Unlock()

	var out []model.TrafficAnalyzedEvent

	for key, agg := range a.windows {
		if now.Sub(key.WindowStart) >= a.window {
			avgSpeed := agg.SpeedSum / float64(agg.Count)

			out = append(out, model.TrafficAnalyzedEvent{
				RoadID:        key.RoadID,
				RoadName:      agg.RoadName,
				WindowStart:   key.WindowStart,
				WindowEnd:     key.WindowStart.Add(a.window),
				TotalVehicles: agg.VehicleSum,
				AvgSpeed:      avgSpeed,
				Congested:     avgSpeed < 20})

			delete(a.windows, key)
		}
	}
	return out
}
