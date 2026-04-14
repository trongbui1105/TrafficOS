package enrich

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// State holds live, evolving simulation state: per-road weather and active
// incidents. All fields are protected by a single RWMutex — the simulator is
// low-frequency so contention is negligible.
type State struct {
	mu        sync.RWMutex
	rng       *rand.Rand
	roads     []RoadMeta
	weather   map[string]*Weather  // road_id -> current weather
	incidents map[string]*Incident // incident_id -> active incident
	seq       uint64
}

// NewState constructs a simulation state seeded with a clear-weather snapshot
// for every road.
func NewState(roads []RoadMeta) *State {
	s := &State{
		rng:       rand.New(rand.NewSource(time.Now().UnixNano())),
		roads:     roads,
		weather:   make(map[string]*Weather, len(roads)),
		incidents: make(map[string]*Incident),
	}
	now := FormatTime(time.Now())
	for _, r := range roads {
		s.weather[r.RoadID] = &Weather{
			RoadID:       r.RoadID,
			ObservedAt:   now,
			Condition:    "clear",
			TemperatureC: 28 + s.rng.Float32()*4,
			HumidityPct:  60 + s.rng.Intn(20),
			WindKph:      5 + s.rng.Float32()*10,
			VisibilityKm: 10,
			RainMm:       0,
		}
	}
	return s
}

// Roads returns an immutable snapshot of the road metadata list.
func (s *State) Roads() []RoadMeta { return s.roads }

// --- Weather -------------------------------------------------------------

var weatherConditions = []string{
	"clear", "cloudy", "rain", "heavy_rain", "fog", "storm", "haze",
}

// TickWeather drifts each road's weather reading and occasionally flips its
// condition to a nearby state. Returns a fresh snapshot suitable for insert.
func (s *State) TickWeather() []Weather {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := FormatTime(time.Now())
	out := make([]Weather, 0, len(s.weather))
	for _, w := range s.weather {
		// 8% chance to transition condition
		if s.rng.Float32() < 0.08 {
			w.Condition = weatherConditions[s.rng.Intn(len(weatherConditions))]
		}
		// Drift temperature ±0.4°C
		w.TemperatureC += (s.rng.Float32() - 0.5) * 0.8
		if w.TemperatureC < 20 {
			w.TemperatureC = 20
		}
		if w.TemperatureC > 38 {
			w.TemperatureC = 38
		}
		// Drift humidity ±3
		w.HumidityPct += s.rng.Intn(7) - 3
		if w.HumidityPct < 40 {
			w.HumidityPct = 40
		}
		if w.HumidityPct > 98 {
			w.HumidityPct = 98
		}
		// Derive rest from condition
		switch w.Condition {
		case "clear":
			w.RainMm = 0
			w.VisibilityKm = 10 + s.rng.Float32()*2
			w.WindKph = 4 + s.rng.Float32()*6
		case "cloudy":
			w.RainMm = 0
			w.VisibilityKm = 8 + s.rng.Float32()*3
			w.WindKph = 6 + s.rng.Float32()*8
		case "rain":
			w.RainMm = 2 + s.rng.Float32()*6
			w.VisibilityKm = 4 + s.rng.Float32()*3
			w.WindKph = 10 + s.rng.Float32()*10
		case "heavy_rain":
			w.RainMm = 10 + s.rng.Float32()*15
			w.VisibilityKm = 1.5 + s.rng.Float32()*2
			w.WindKph = 20 + s.rng.Float32()*15
		case "fog":
			w.RainMm = 0
			w.VisibilityKm = 0.5 + s.rng.Float32()*1.5
			w.WindKph = 2 + s.rng.Float32()*4
		case "storm":
			w.RainMm = 20 + s.rng.Float32()*20
			w.VisibilityKm = 1 + s.rng.Float32()*2
			w.WindKph = 40 + s.rng.Float32()*25
		case "haze":
			w.RainMm = 0
			w.VisibilityKm = 3 + s.rng.Float32()*3
			w.WindKph = 3 + s.rng.Float32()*5
		}
		w.ObservedAt = now
		out = append(out, *w)
	}
	return out
}

// WeatherFor returns the current weather snapshot for a given road (or nil).
func (s *State) WeatherFor(roadID string) *Weather {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if w, ok := s.weather[roadID]; ok {
		copy := *w
		return &copy
	}
	return nil
}

// SpeedFactorFor returns a multiplier (0.3-1.0) to apply to a road's nominal
// speed based on the current weather — rainy/stormy weather slows traffic.
func (s *State) SpeedFactorFor(roadID string) float64 {
	w := s.WeatherFor(roadID)
	if w == nil {
		return 1.0
	}
	switch w.Condition {
	case "clear":
		return 1.0
	case "cloudy":
		return 0.95
	case "haze":
		return 0.9
	case "rain":
		return 0.82
	case "fog":
		return 0.75
	case "heavy_rain":
		return 0.65
	case "storm":
		return 0.5
	}
	return 1.0
}

// --- Incidents -----------------------------------------------------------

var incidentTypes = []string{
	"accident", "roadwork", "breakdown", "protest", "flood", "event", "debris",
}

var incidentDescriptions = map[string][]string{
	"accident":  {"Multi-vehicle collision blocking 2 lanes", "Rear-end crash — emergency services on scene", "Motorcycle accident — single lane open"},
	"roadwork":  {"Scheduled asphalt resurfacing", "Utility maintenance — trench open", "Lane striping in progress"},
	"breakdown": {"Stalled bus in curb lane", "Truck breakdown — partial obstruction", "Taxi with flat tire blocking lane"},
	"protest":   {"Crowd gathering — pedestrians on roadway", "Peaceful demonstration partially blocking street"},
	"flood":     {"Heavy rain flooding underpass", "Water level rising — use alternate route", "Flash flood — road closed"},
	"event":     {"Sports event crowd dispersing", "Concert let-out — severe congestion", "Street festival — road closed to vehicles"},
	"debris":    {"Fallen tree blocking lane", "Construction debris in roadway", "Large object in travel lane"},
}

var severityLevels = []string{"LOW", "MEDIUM", "HIGH"}

// TickIncidents runs one step of the incident lifecycle: ages existing
// incidents (with a chance to resolve), and probabilistically spawns new
// ones. Returns every incident whose state just changed, ready to upsert.
func (s *State) TickIncidents() []Incident {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	nowStr := FormatTime(now)
	changed := make([]Incident, 0)

	// Resolve active incidents — 25% chance each tick
	for id, inc := range s.incidents {
		if inc.Status != "active" {
			continue
		}
		if s.rng.Float32() < 0.25 {
			inc.Status = "resolved"
			ended := nowStr
			inc.EndedAt = &ended
			inc.UpdatedAt = nowStr
			changed = append(changed, *inc)
			delete(s.incidents, id)
		}
	}

	// Spawn 0-3 new incidents per tick, skewed toward 0-1
	spawnCount := 0
	r := s.rng.Float32()
	switch {
	case r < 0.55:
		spawnCount = 0
	case r < 0.85:
		spawnCount = 1
	case r < 0.97:
		spawnCount = 2
	default:
		spawnCount = 3
	}
	for i := 0; i < spawnCount && len(s.roads) > 0; i++ {
		road := s.roads[s.rng.Intn(len(s.roads))]
		iType := incidentTypes[s.rng.Intn(len(incidentTypes))]
		sev := severityLevels[s.rng.Intn(len(severityLevels))]
		descs := incidentDescriptions[iType]
		desc := descs[s.rng.Intn(len(descs))]
		lanes := 1
		switch sev {
		case "MEDIUM":
			lanes = 2
		case "HIGH":
			lanes = 3
		}
		s.seq++
		inc := &Incident{
			IncidentID:   fmt.Sprintf("INC-%d-%06d", now.Unix(), s.seq),
			RoadID:       road.RoadID,
			RoadName:     road.RoadName,
			Type:         iType,
			Severity:     sev,
			Status:       "active",
			LanesBlocked: lanes,
			Description:  desc,
			StartedAt:    nowStr,
			EndedAt:      nil,
			UpdatedAt:    nowStr,
		}
		s.incidents[inc.IncidentID] = inc
		changed = append(changed, *inc)
	}

	return changed
}

// ActiveIncidentCountFor reports how many active incidents impact a given road.
// The generator uses this to further slow simulated traffic.
func (s *State) ActiveIncidentCountFor(roadID string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, inc := range s.incidents {
		if inc.RoadID == roadID && inc.Status == "active" {
			count++
		}
	}
	return count
}

// --- Environment ---------------------------------------------------------

// EnvironmentFor derives an Environment reading from the current weather
// and the most recent traffic intensity (normalized 0-1). The formula blends
// a baseline, a traffic contribution, and a weather modifier.
func (s *State) EnvironmentFor(roadID string, trafficIntensity float64) Environment {
	s.mu.RLock()
	defer s.mu.RUnlock()

	w := s.weather[roadID]
	condModifier := float32(1.0)
	if w != nil {
		switch w.Condition {
		case "haze", "fog":
			condModifier = 1.6
		case "rain", "heavy_rain", "storm":
			condModifier = 0.6 // rain washes particulates
		case "clear":
			condModifier = 1.0
		}
	}

	base := float32(18) // baseline PM2.5 in HCMC
	trafficPM := float32(trafficIntensity * 45)
	pm25 := (base + trafficPM) * condModifier
	pm10 := pm25*1.6 + s.rng.Float32()*5
	no2 := 20 + float32(trafficIntensity*60) + s.rng.Float32()*5
	co := 0.3 + float32(trafficIntensity*1.8) + s.rng.Float32()*0.2
	noise := 50 + float32(trafficIntensity*30) + s.rng.Float32()*4

	aqi := int(pm25 * 2.1)
	if aqi > 500 {
		aqi = 500
	}
	if aqi < 10 {
		aqi = 10
	}

	return Environment{
		RoadID:     roadID,
		ObservedAt: FormatTime(time.Now()),
		PM25:       pm25,
		PM10:       pm10,
		NO2:        no2,
		COPpm:      co,
		AQI:        aqi,
		NoiseDb:    noise,
	}
}

// --- Vehicle classification ----------------------------------------------

// VehicleMixFor breaks a total vehicle count into a realistic class mix for
// the given road type (motorcycle-heavy in HCMC). Pedestrians are added on
// top and scale with the environment noise baseline.
func (s *State) VehicleMixFor(roadID, roadType string, totalVehicles int) VehicleMix {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// HCMC motorcycle share is ~70% by default.
	var motoShare, carShare, truckShare, busShare, bikeShare, emergShare float64
	switch roadType {
	case "highway":
		motoShare, carShare, truckShare, busShare, bikeShare = 0.40, 0.35, 0.15, 0.08, 0.01
	case "arterial":
		motoShare, carShare, truckShare, busShare, bikeShare = 0.65, 0.22, 0.05, 0.06, 0.015
	case "collector":
		motoShare, carShare, truckShare, busShare, bikeShare = 0.72, 0.18, 0.03, 0.04, 0.025
	default:
		motoShare, carShare, truckShare, busShare, bikeShare = 0.75, 0.15, 0.02, 0.03, 0.04
	}
	emergShare = 0.005

	jitter := func(share float64) float64 {
		return share * (0.9 + s.rng.Float64()*0.2) // ±10%
	}

	cars := int(float64(totalVehicles) * jitter(carShare))
	trucks := int(float64(totalVehicles) * jitter(truckShare))
	buses := int(float64(totalVehicles) * jitter(busShare))
	motos := int(float64(totalVehicles) * jitter(motoShare))
	bikes := int(float64(totalVehicles) * jitter(bikeShare))
	emergency := 0
	if s.rng.Float64() < emergShare*5 { // rare but present
		emergency = 1
	}
	pedestrians := int(float64(totalVehicles) * (0.15 + s.rng.Float64()*0.2))

	return VehicleMix{
		RoadID:      roadID,
		ObservedAt:  FormatTime(time.Now()),
		Cars:        cars,
		Trucks:      trucks,
		Buses:       buses,
		Motorcycles: motos,
		Bicycles:    bikes,
		Emergency:   emergency,
		Pedestrians: pedestrians,
	}
}
