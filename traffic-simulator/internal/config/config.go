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
	KafkaBroker string
	Topic       string
	Interval    time.Duration
	Roads       []RoadConfig
}

func LoadConfig() (*AppConfig, error) {
	broker := getEnv("KAFKA_BROKER", "kafka:9092")
	topic := getEnv("KAFKA_TOPIC", "traffic.raw")
	intervalStr := getEnv("GENERATOR_INTERVAL", "5s")

	interval, err := time.ParseDuration(intervalStr)
	if err != nil {
		return nil, err
	}

	// Load road names from txt
	roads, err := loadRoads("data/road-names.txt")
	if err != nil {
		return nil, err
	}

	return &AppConfig{
		KafkaBroker: broker,
		Topic:       topic,
		Interval:    interval,
		Roads:       roads,
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
