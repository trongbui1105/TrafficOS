package kafka

import (
	"context"
	"fmt"
	"log"
	"traffic-simulator/internal/avro"
	"traffic-simulator/internal/model"

	"github.com/segmentio/kafka-go"
)

// Producer writes Avro-encoded TrafficEvents to a Kafka topic.
type Producer struct {
	writer  *kafka.Writer
	encoder *avro.Encoder
}

func NewProducer(broker, topic, schemaRegistryURL string) (*Producer, error) {
	encoder, err := avro.NewEncoder(
		schemaRegistryURL,
		topic+"-value", // Confluent convention: <topic>-value
		"schemas/traffic_event.avsc",
	)
	if err != nil {
		return nil, fmt.Errorf("create avro encoder: %w", err)
	}

	writer := &kafka.Writer{
		Addr:         kafka.TCP(broker),
		Topic:        topic,
		Balancer:     &kafka.Hash{}, // same roadId → same partition
		RequiredAcks: kafka.RequireOne,
		Async:        false,
	}

	return &Producer{writer: writer, encoder: encoder}, nil
}

func (p *Producer) Send(event model.TrafficEvent) error {
	native := map[string]interface{}{
		"eventType":    event.EventType,
		"roadId":       event.RoadID,
		"roadName":     event.RoadName,
		"vehicleCount": event.VehicleCount,
		"avgSpeed":     event.AvgSpeed,
		"timestamp":    event.Timestamp.UnixMilli(),
	}

	data, err := p.encoder.Encode(native)
	if err != nil {
		return fmt.Errorf("encode event: %w", err)
	}

	err = p.writer.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(event.RoadID),
		Value: data,
	})
	if err != nil {
		log.Println("kafka write error:", err)
	}
	return err
}

func (p *Producer) Close() {
	if err := p.writer.Close(); err != nil {
		log.Println("kafka writer close error:", err)
	}
}
