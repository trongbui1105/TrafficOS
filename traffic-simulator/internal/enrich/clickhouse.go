package enrich

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Sink writes enrichment records to ClickHouse over its HTTP interface using
// the JSONEachRow format. Each call is a single INSERT batch.
type Sink struct {
	baseURL string
	client  *http.Client
}

// NewSink builds a Sink that talks to the given ClickHouse HTTP endpoint, e.g.
// "http://clickhouse:8123".
func NewSink(baseURL string) *Sink {
	return &Sink{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// insertJSONEachRow POSTs a set of rows encoded as newline-delimited JSON to
// a target table. Returns the first error encountered, if any.
func (s *Sink) insertJSONEachRow(table string, rows []any) error {
	if len(rows) == 0 {
		return nil
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for _, r := range rows {
		if err := enc.Encode(r); err != nil {
			return fmt.Errorf("encode row: %w", err)
		}
	}

	q := url.Values{}
	q.Set("query", fmt.Sprintf("INSERT INTO %s FORMAT JSONEachRow", table))

	endpoint := s.baseURL + "/?" + q.Encode()
	req, err := http.NewRequest(http.MethodPost, endpoint, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-ndjson")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("clickhouse http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("clickhouse %s: %s", resp.Status, string(body))
	}
	return nil
}

// InsertRoadMetadata upserts a batch of road_metadata rows.
func (s *Sink) InsertRoadMetadata(rows []RoadMeta) error {
	items := make([]any, len(rows))
	for i, r := range rows {
		items[i] = r
	}
	return s.insertJSONEachRow("road_metadata", items)
}

// InsertWeather writes weather_observations rows.
func (s *Sink) InsertWeather(rows []Weather) error {
	items := make([]any, len(rows))
	for i, r := range rows {
		items[i] = r
	}
	return s.insertJSONEachRow("weather_observations", items)
}

// InsertIncidents upserts traffic_incidents rows.
func (s *Sink) InsertIncidents(rows []Incident) error {
	items := make([]any, len(rows))
	for i, r := range rows {
		items[i] = r
	}
	return s.insertJSONEachRow("traffic_incidents", items)
}

// InsertEnvironment writes environment_metrics rows.
func (s *Sink) InsertEnvironment(rows []Environment) error {
	items := make([]any, len(rows))
	for i, r := range rows {
		items[i] = r
	}
	return s.insertJSONEachRow("environment_metrics", items)
}

// InsertVehicleMix writes vehicle_classification rows.
func (s *Sink) InsertVehicleMix(rows []VehicleMix) error {
	items := make([]any, len(rows))
	for i, r := range rows {
		items[i] = r
	}
	return s.insertJSONEachRow("vehicle_classification", items)
}
