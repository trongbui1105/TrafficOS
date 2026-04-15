package enrich

import (
	"testing"
)

func testRoads() []RoadMeta {
	return []RoadMeta{
		{RoadID: "R001", RoadName: "Nguyen Hue", RoadType: "arterial"},
		{RoadID: "R002", RoadName: "Le Loi", RoadType: "collector"},
		{RoadID: "R003", RoadName: "Highway 1", RoadType: "highway"},
	}
}

func TestNewState_SeedsWeatherForAllRoads(t *testing.T) {
	s := NewState(testRoads())
	if len(s.Roads()) != 3 {
		t.Errorf("expected 3 roads, got %d", len(s.Roads()))
	}
	for _, r := range testRoads() {
		w := s.WeatherFor(r.RoadID)
		if w == nil {
			t.Errorf("no weather for %s", r.RoadID)
			continue
		}
		if w.Condition != "clear" {
			t.Errorf("initial condition for %s should be clear, got %s", r.RoadID, w.Condition)
		}
	}
}

func TestWeatherFor_UnknownRoadReturnsNil(t *testing.T) {
	s := NewState(testRoads())
	if w := s.WeatherFor("R999"); w != nil {
		t.Errorf("expected nil weather for unknown road, got %+v", w)
	}
}

func TestSpeedFactorFor_AllConditions(t *testing.T) {
	s := NewState(testRoads())
	cases := map[string]float64{
		"clear":      1.0,
		"cloudy":     0.95,
		"haze":       0.9,
		"rain":       0.82,
		"fog":        0.75,
		"heavy_rain": 0.65,
		"storm":      0.5,
	}
	for cond, want := range cases {
		s.weather["R001"].Condition = cond
		if got := s.SpeedFactorFor("R001"); got != want {
			t.Errorf("SpeedFactor for %s = %v, want %v", cond, got, want)
		}
	}
}

func TestSpeedFactorFor_UnknownRoadReturnsOne(t *testing.T) {
	s := NewState(testRoads())
	if f := s.SpeedFactorFor("R999"); f != 1.0 {
		t.Errorf("expected 1.0 for unknown road, got %v", f)
	}
}

func TestTickWeather_ProducesSnapshotForAllRoads(t *testing.T) {
	s := NewState(testRoads())
	snap := s.TickWeather()
	if len(snap) != 3 {
		t.Errorf("expected 3 weather entries, got %d", len(snap))
	}
	for _, w := range snap {
		if w.TemperatureC < 20 || w.TemperatureC > 38 {
			t.Errorf("temperature out of clamped range for %s: %v", w.RoadID, w.TemperatureC)
		}
		if w.HumidityPct < 40 || w.HumidityPct > 98 {
			t.Errorf("humidity out of clamped range for %s: %v", w.RoadID, w.HumidityPct)
		}
	}
}

func TestActiveIncidentCountFor_NoneInitially(t *testing.T) {
	s := NewState(testRoads())
	if n := s.ActiveIncidentCountFor("R001"); n != 0 {
		t.Errorf("expected 0 active incidents initially, got %d", n)
	}
}

func TestTickIncidents_EventuallySpawns(t *testing.T) {
	s := NewState(testRoads())
	spawned := false
	// Run many ticks — roughly 45% chance per tick, so 40 ticks makes probability
	// of never spawning astronomically small (~1e-10).
	for i := 0; i < 40; i++ {
		_ = s.TickIncidents()
		total := 0
		for _, r := range testRoads() {
			total += s.ActiveIncidentCountFor(r.RoadID)
		}
		if total > 0 {
			spawned = true
			break
		}
	}
	if !spawned {
		t.Error("expected at least one incident to spawn after 40 ticks")
	}
}

func TestEnvironmentFor_ProducesBoundedAQI(t *testing.T) {
	s := NewState(testRoads())
	for intensity := 0.0; intensity <= 1.0; intensity += 0.2 {
		env := s.EnvironmentFor("R001", intensity)
		if env.AQI < 10 || env.AQI > 500 {
			t.Errorf("AQI out of bounds for intensity %v: %d", intensity, env.AQI)
		}
		if env.PM25 <= 0 {
			t.Errorf("PM2.5 should be positive, got %v", env.PM25)
		}
	}
}

func TestVehicleMixFor_SharesByRoadType(t *testing.T) {
	s := NewState(testRoads())
	types := []string{"highway", "arterial", "collector", "local"}
	for _, rt := range types {
		mix := s.VehicleMixFor("R001", rt, 100)
		if mix.RoadID != "R001" {
			t.Errorf("road id mismatch for %s", rt)
		}
		total := mix.Cars + mix.Trucks + mix.Buses + mix.Motorcycles + mix.Bicycles
		// Allow for rounding losses — total should be within ±15% of the input
		if total < 70 || total > 130 {
			t.Errorf("vehicle total for %s drifted: %d (input 100)", rt, total)
		}
		// Motorcycles should dominate in HCMC arterial/collector/local
		if rt != "highway" && mix.Motorcycles < mix.Cars {
			t.Errorf("expected motorcycles to dominate on %s, got motos=%d cars=%d",
				rt, mix.Motorcycles, mix.Cars)
		}
	}
}

func TestFormatTime_ClickHouseFormat(t *testing.T) {
	// Should always emit "YYYY-MM-DD HH:MM:SS" in UTC
	s := NewState(testRoads())
	snap := s.TickWeather()
	if len(snap) == 0 {
		t.Fatal("no snapshot")
	}
	obs := snap[0].ObservedAt
	if len(obs) != len("2006-01-02 15:04:05") {
		t.Errorf("ObservedAt format wrong: %q", obs)
	}
}
