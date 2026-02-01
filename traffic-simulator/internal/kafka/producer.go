package kafka

import (
	"context"
	"encoding/json"
	"log"
	"traffic-simulator/internal/model"

	"github.com/segmentio/kafka-go"
)

type Producer struct {
	writer *kafka.Writer
}

func NewProducer(broker, topic string) *Producer {
	writer := &kafka.Writer{
		Addr:     kafka.TCP(broker), // Kafka bootstrap server
		Topic:    topic,
		Balancer: &kafka.Hash{}, // same roadId -> same partition

		RequiredAcks: kafka.RequireOne,
		Async:        false, //ensure delivery before returning
	}

	return &Producer{writer: writer}
}

func (p *Producer) Send(event model.TrafficEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		log.Println("json marshal error:", err)
		return err
	}

	err = p.writer.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(event.RoadID), // ordering per road,
		Value: data,
	})
	if err != nil {
		log.Println("Kafka write messages error:", err)
	}
	return err
}

func (p *Producer) Close() {
	if err := p.writer.Close(); err != nil {
		log.Println("Kafka writer close error:", err)
	}
}
