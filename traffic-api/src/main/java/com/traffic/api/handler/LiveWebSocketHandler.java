package com.traffic.api.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traffic.api.model.WebSocketMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import reactor.util.concurrent.Queues;

/**
 * Reactive WebSocket handler for the {@code /ws/live} endpoint.
 *
 * <p>Uses a {@link Sinks.Many} multicast sink as the event bus.
 * Any component (Kafka consumer, alert engine listener) can call
 * {@link #broadcast(WebSocketMessage)} to push events to all connected clients.
 *
 * <p>Key reactive concepts:
 * <ul>
 *   <li><b>Sinks.Many</b> — hot publisher that multicasts to multiple subscribers</li>
 *   <li><b>Flux</b> — infinite stream of WebSocket messages pushed over time</li>
 *   <li>No thread blocking — everything runs on Netty's event loop</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LiveWebSocketHandler implements WebSocketHandler {

    private final ObjectMapper objectMapper;

    // multicast: new subscribers receive only events published after they subscribe.
    // autoCancel=false prevents the sink from self-completing when all subscribers cancel —
    // without this, the sink completes on the first disconnect and every subsequent
    // WebSocket client immediately receives onComplete (the root cause of the disconnect loop).
    private final Sinks.Many<WebSocketMessage> sink =
            Sinks.many().multicast().onBackpressureBuffer(Queues.SMALL_BUFFER_SIZE, false);

    /**
     * Called by the Kafka consumer whenever a new analyzed event or alert arrives.
     * Thread-safe — Sinks.Many handles concurrent emitters.
     */
    public void broadcast(WebSocketMessage message) {
        sink.tryEmitNext(message);
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        log.info("WebSocket client connected: {}", session.getId());

        // Drain incoming client frames (pings, browser-initiated close, etc.).
        // Without this, backpressure builds up and some WS implementations close the session.
        Mono<Void> input = session.receive()
                .doOnNext(msg -> log.trace("Client frame from {}: {}", session.getId(), msg.getType()))
                .then();

        Flux<String> jsonFlux = sink.asFlux()
                .map(msg -> {
                    try {
                        return objectMapper.writeValueAsString(msg);
                    } catch (Exception e) {
                        return "{\"type\":\"error\",\"data\":\"serialization failed\"}";
                    }
                });

        Mono<Void> output = session.send(
                jsonFlux.map(session::textMessage)
        ).doFinally(signal ->
                log.info("WebSocket client disconnected: {} ({})", session.getId(), signal)
        );

        // Zip input + output: the session stays alive until EITHER side terminates.
        // When the client disconnects, input completes → Mono.zip completes → session closes cleanly.
        return Mono.zip(input, output).then();
    }
}
