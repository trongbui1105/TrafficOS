package main

import (
	"log"
	"time"
	"traffic-simulator/internal/config"
	"traffic-simulator/internal/engine"
	"traffic-simulator/internal/kafka"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatal("failed to load config:", err)
	}

	generator := engine.NewGenerator()

	producer := kafka.NewProducer(cfg.KafkaBroker, cfg.Topic)
	defer producer.Close()

	log.Println("Starting traffic simulator...")
	log.Println("Road count: ", len(cfg.Roads))
	log.Println("Interval:   ", cfg.Interval)

	// Periodic generation loop
	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()

	for range ticker.C {
		for _, road := range cfg.Roads {
			// Generate event
			event := generator.GenerateEvent(road)

			// send to kafka
			err := producer.Send(event)
			if err != nil {
				log.Println("Failed to send event:", err)
			}
			log.Printf("sent %s (%s)", event.RoadID, event.RoadName)
		}
	}
}
