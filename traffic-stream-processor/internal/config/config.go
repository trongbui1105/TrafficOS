package config

import (
	"os"
	"strings"
	"time"
)

type Config struct {
	Brokers     []string
	GroupID     string
	InputTopic  string
	OutputTopic string
	WindowSize  time.Duration
}

func Load() Config {
	return Config{
		Brokers:     strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
		GroupID:     getEnv("KAFKA_GROUP_ID", "traffic-processor"),
		InputTopic:  getEnv("KAFKA_INPUT_TOPIC", "traffic.raw"),
		OutputTopic: getEnv("KAFKA_OUTPUT_TOPIC", "traffic.analyzed"),
		WindowSize:  getDuration("WINDOW_SIZE", 30*time.Second),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
