package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFormatRoadID(t *testing.T) {
	cases := []struct {
		in   int
		want string
	}{
		{1, "R001"},
		{9, "R009"},
		{42, "R042"},
		{100, "R100"},
		{572, "R572"},
	}
	for _, c := range cases {
		if got := formatRoadID(c.in); got != c.want {
			t.Errorf("formatRoadID(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestGetEnv(t *testing.T) {
	t.Setenv("TA_TEST_VAR", "hello")
	if v := getEnv("TA_TEST_VAR", "fallback"); v != "hello" {
		t.Errorf("getEnv should return env value, got %q", v)
	}
	if v := getEnv("TA_UNSET_VAR", "fallback"); v != "fallback" {
		t.Errorf("getEnv should return fallback when unset, got %q", v)
	}
	// Empty env var should use fallback
	t.Setenv("TA_EMPTY", "")
	if v := getEnv("TA_EMPTY", "fallback"); v != "fallback" {
		t.Errorf("getEnv should treat empty as unset, got %q", v)
	}
}

func TestLoadRoads(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "roads.txt")
	content := "Nguyen Hue\nLe Loi\n\n  Dong Khoi  \n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	roads, err := loadRoads(path)
	if err != nil {
		t.Fatalf("loadRoads failed: %v", err)
	}

	if len(roads) != 3 {
		t.Fatalf("expected 3 roads (blank line skipped), got %d", len(roads))
	}
	if roads[0].RoadID != "R001" || roads[0].RoadName != "Nguyen Hue" {
		t.Errorf("first road wrong: %+v", roads[0])
	}
	if roads[2].RoadName != "Dong Khoi" {
		t.Errorf("whitespace not trimmed: %q", roads[2].RoadName)
	}
	// Validate deterministic capacity/speed formula
	for _, r := range roads {
		if r.BaseCapacity < 150 || r.BaseCapacity > 350 {
			t.Errorf("base capacity out of expected range: %d", r.BaseCapacity)
		}
		if r.SpeedLimit < 30 || r.SpeedLimit > 60 {
			t.Errorf("speed limit out of expected range: %d", r.SpeedLimit)
		}
	}
}

func TestLoadRoadsMissingFile(t *testing.T) {
	_, err := loadRoads("/nonexistent/path/roads.txt")
	if err == nil {
		t.Error("expected error for missing file")
	}
}
