package processor

import (
	"context"
	"encoding/json"
	"log"
	"time"
	"traffic-stream-processor/internal/model"

	"github.com/segmentio/kafka-go"
)

// StreamProcessor wires Kafka reader → aggregator → Kafka writer.
type StreamProcessor struct {
	Reader     *kafka.Reader
	Writer     *kafka.Writer
	Aggregator *Aggregator
}

// Run starts the stream processing loop.
func (p *StreamProcessor) Run(ctx context.Context) error {
	ticker := time.NewTicker(time.Second * 5)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		default:
			msg, err := p.Reader.ReadMessage(ctx)
			if err != nil {
				log.Printf("error reading message from kafka: %v", err)
				continue
			}

			var event model.TrafficEvent
			if err := json.Unmarshal(msg.Value, &event); err != nil {
				log.Println("error unmarshalling traffic event", err)
				continue
			}

			p.Aggregator.Add(event)
		}

		select {
		case <-ticker.C:
			events := p.Aggregator.Flush(time.Now())
			for _, e := range events {
				p.publish(ctx, e)
			}
		default:
		}
	}
}

func (p *StreamProcessor) publish(ctx context.Context, event model.TrafficAnalyzedEvent) {
	bytes, _ := json.Marshal(event)
	err := p.Writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(event.RoadID),
		Value: bytes,
	})
	if err != nil {
		log.Printf("error writing analyzed event to kafka: %v", err)
	}
}
