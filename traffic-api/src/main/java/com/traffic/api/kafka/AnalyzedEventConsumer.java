package com.traffic.api.kafka;

import com.traffic.api.handler.LiveWebSocketHandler;
import com.traffic.api.model.RoadStatus;
import com.traffic.api.model.WebSocketMessage;
import com.traffic.api.repository.RedisRoadRepository;
import com.traffic.TrafficAnalyzedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Consumes {@code traffic.analyzed} and:
 * <ol>
 *   <li>Updates Redis with the latest road status (TTL 60s)</li>
 *   <li>Broadcasts a {@code road_update} WebSocket message to all connected clients</li>
 * </ol>
 *
 * <p>Spring's {@code @KafkaListener} runs on a dedicated thread pool so the
 * reactive Redis call is bridged with {@code block()} here for simplicity.
 * In a fully reactive setup this would use Reactor Kafka instead.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AnalyzedEventConsumer {

    private final RedisRoadRepository redisRepository;
    private final LiveWebSocketHandler webSocketHandler;

    @KafkaListener(topics = "${traffic.topics.analyzed}", groupId = "traffic-api")
    public void consume(ConsumerRecord<String, TrafficAnalyzedEvent> record) {
        TrafficAnalyzedEvent event = record.value();

        RoadStatus status = RoadStatus.builder()
                .roadId(event.getRoadId().toString())
                .roadName(event.getRoadName().toString())
                .totalVehicles(event.getTotalVehicles())
                .avgSpeed(event.getAvgSpeed())
                .congested(event.getCongested())
                .updatedAt(Instant.now())
                .build();

        // Update Redis cache (block is acceptable on Spring Kafka's thread pool)
        redisRepository.save(status).block();

        // Push to all WebSocket clients
        webSocketHandler.broadcast(
                WebSocketMessage.builder()
                        .type("road_update")
                        .data(status)
                        .build()
        );

        log.debug("Updated road {} — speed={} congested={}",
                status.getRoadId(), String.format("%.1f", status.getAvgSpeed()), status.isCongested());
    }
}
