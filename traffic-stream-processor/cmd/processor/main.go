package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"traffic-stream-processor/internal/config"
	"traffic-stream-processor/internal/kafka"
	processorPkg "traffic-stream-processor/internal/processor"
)

func main() {
	cfg := config.Load()

	reader := kafka.NewReader(cfg.Brokers, cfg.GroupID, cfg.InputTopic)
	writer := kafka.NewWriter(cfg.Brokers, cfg.OutputTopic)

	processor := &processorPkg.StreamProcessor{
		Reader:     reader,
		Writer:     writer,
		Aggregator: processorPkg.NewAggregator(cfg.WindowSize),
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Println("Starting processor ...")
	if err := processor.Run(ctx); err != nil {
		log.Fatalf("Processor stopped with error: %v", err)
	}
}
