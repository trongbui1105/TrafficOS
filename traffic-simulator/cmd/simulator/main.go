package main

import (
	"log"
	"time"

	"traffic-simulator/internal/config"
	"traffic-simulator/internal/engine"
	"traffic-simulator/internal/enrich"
	"traffic-simulator/internal/kafka"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatal("failed to load config:", err)
	}

	// --- Build road metadata and initial simulation state -------------
	metas := make([]enrich.RoadMeta, 0, len(cfg.Roads))
	metaByID := make(map[string]enrich.RoadMeta, len(cfg.Roads))
	for i, road := range cfg.Roads {
		meta := enrich.BuildMeta(i+1, road.RoadID, road.RoadName, road.SpeedLimit)
		metas = append(metas, meta)
		metaByID[road.RoadID] = meta
	}

	state := enrich.NewState(metas)
	sink := enrich.NewSink(cfg.ClickHouseURL)

	// One-shot: upsert road_metadata so the API has static info.
	if err := sink.InsertRoadMetadata(metas); err != nil {
		log.Println("warn: failed to insert road_metadata:", err)
	} else {
		log.Printf("wrote %d road_metadata rows to ClickHouse", len(metas))
	}

	// --- Kafka producer for raw traffic events -------------------------
	producer, err := kafka.NewProducer(cfg.KafkaBroker, cfg.Topic, cfg.SchemaRegistryURL)
	if err != nil {
		log.Fatal("failed to create producer:", err)
	}
	defer producer.Close()

	generator := engine.NewGenerator().WithState(state)

	log.Println("Starting traffic simulator...")
	log.Println("Road count:        ", len(cfg.Roads))
	log.Println("Kafka interval:    ", cfg.Interval)
	log.Println("Weather interval:  ", cfg.WeatherInterval)
	log.Println("Incident interval: ", cfg.IncidentInterval)
	log.Println("Schema Registry:   ", cfg.SchemaRegistryURL)
	log.Println("ClickHouse:        ", cfg.ClickHouseURL)

	// --- Enrichment ticker: weather -----------------------------------
	go func() {
		t := time.NewTicker(cfg.WeatherInterval)
		defer t.Stop()
		for range t.C {
			snapshot := state.TickWeather()
			if err := sink.InsertWeather(snapshot); err != nil {
				log.Println("weather insert:", err)
				continue
			}
			log.Printf("weather: wrote %d observations", len(snapshot))
		}
	}()

	// --- Enrichment ticker: incident lifecycle ------------------------
	go func() {
		t := time.NewTicker(cfg.IncidentInterval)
		defer t.Stop()
		for range t.C {
			changed := state.TickIncidents()
			if len(changed) == 0 {
				continue
			}
			if err := sink.InsertIncidents(changed); err != nil {
				log.Println("incident insert:", err)
				continue
			}
			log.Printf("incidents: upserted %d rows", len(changed))
		}
	}()

	// --- Main loop: Kafka + vehicle mix + environment -----------------
	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()

	for range ticker.C {
		envBatch := make([]enrich.Environment, 0, len(cfg.Roads))
		mixBatch := make([]enrich.VehicleMix, 0, len(cfg.Roads))

		for _, road := range cfg.Roads {
			event := generator.GenerateEvent(road)

			if err := producer.Send(event); err != nil {
				log.Println("failed to send event:", err)
				continue
			}

			// Traffic intensity normalized 0-1 vs. base capacity
			intensity := float64(event.VehicleCount) / float64(road.BaseCapacity)
			if intensity > 1 {
				intensity = 1
			}

			envBatch = append(envBatch, state.EnvironmentFor(road.RoadID, intensity))

			roadType := "collector"
			if m, ok := metaByID[road.RoadID]; ok {
				roadType = m.RoadType
			}
			mixBatch = append(mixBatch, state.VehicleMixFor(road.RoadID, roadType, event.VehicleCount))
		}

		if err := sink.InsertEnvironment(envBatch); err != nil {
			log.Println("env insert:", err)
		}
		if err := sink.InsertVehicleMix(mixBatch); err != nil {
			log.Println("vehicle mix insert:", err)
		}
	}
}
