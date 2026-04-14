package config

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"time"
)

type RoadConfig struct {
	RoadID       string
	RoadName     string
	BaseCapacity int // max vehicles before congestion
	SpeedLimit   int // max speed (km/h)
}

type AppConfig struct {
	KafkaBroker       string
	Topic             string
	SchemaRegistryURL string
	ClickHouseURL     string // e.g. http://clickhouse:8123 — used for direct enrichment inserts
	Interval          time.Duration
	WeatherInterval   time.Duration
	IncidentInterval  time.Duration
	Roads             []RoadConfig
}

func LoadConfig() (*AppConfig, error) {
	broker := getEnv("KAFKA_BROKER", "kafka:9092")
	topic := getEnv("KAFKA_TOPIC", "traffic.raw")
	schemaRegistryURL := getEnv("SCHEMA_REGISTRY_URL", "http://schema-registry:8082")
	clickHouseURL := getEnv("CLICKHOUSE_URL", "http://clickhouse:8123")
	intervalStr := getEnv("GENERATOR_INTERVAL", "5s")
	weatherStr := getEnv("WEATHER_INTERVAL", "30s")
	incidentStr := getEnv("INCIDENT_INTERVAL", "20s")

	interval, err := time.ParseDuration(intervalStr)
	if err != nil {
		return nil, err
	}
	weatherInterval, err := time.ParseDuration(weatherStr)
	if err != nil {
		return nil, err
	}
	incidentInterval, err := time.ParseDuration(incidentStr)
	if err != nil {
		return nil, err
	}

	// Load road names from txt
	roads, err := loadRoads("data/road-names.txt")
	if err != nil {
		return nil, err
	}

	return &AppConfig{
		KafkaBroker:       broker,
		Topic:             topic,
		SchemaRegistryURL: schemaRegistryURL,
		ClickHouseURL:     clickHouseURL,
		Interval:          interval,
		WeatherInterval:   weatherInterval,
		IncidentInterval:  incidentInterval,
		Roads:             roads,
	}, nil
}

func loadRoads(path string) ([]RoadConfig, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	roads := make([]RoadConfig, 0)
	index := 1

	for scanner.Scan() {
		name := strings.TrimSpace(scanner.Text())
		if name == "" {
			continue
		}

		road := RoadConfig{
			RoadID:       formatRoadID(index),
			RoadName:     name,
			BaseCapacity: 150 + (index%5)*50,
			SpeedLimit:   30 + (index%4)*10,
		}

		roads = append(roads, road)
		index++
	}

	return roads, scanner.Err()
}

func formatRoadID(i int) string {
	return "R" + fmt.Sprintf("%03d", i)
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
