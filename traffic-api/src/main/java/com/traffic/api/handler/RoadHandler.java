package com.traffic.api.handler;

import com.traffic.api.repository.ClickHouseRoadRepository;
import com.traffic.api.repository.RedisRoadRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Instant;

/**
 * Functional-style request handlers for road-related REST endpoints.
 *
 * <p>Spring WebFlux supports two programming models:
 * <ul>
 *   <li><b>Annotated controllers</b> — familiar {@code @RestController} style</li>
 *   <li><b>Functional endpoints</b> — {@code RouterFunction} + {@code HandlerFunction} (used here)</li>
 * </ul>
 *
 * <p>ClickHouse queries are blocking (JDBC), so they are offloaded to
 * {@code Schedulers.boundedElastic()} to avoid blocking Netty's event loop.
 */
@Component
@RequiredArgsConstructor
public class RoadHandler {

    private final RedisRoadRepository redisRepo;
    private final ClickHouseRoadRepository clickHouseRepo;

    /** GET /api/v1/roads — current status of all roads (from Redis). */
    public Mono<ServerResponse> getAllRoads(ServerRequest request) {
        return ServerResponse.ok()
                .body(redisRepo.findAll(), com.traffic.api.model.RoadStatus.class);
    }

    /** GET /api/v1/roads/{id} — current status of a specific road. */
    public Mono<ServerResponse> getRoad(ServerRequest request) {
        String roadId = request.pathVariable("id");
        return redisRepo.findById(roadId)
                .flatMap(status -> ServerResponse.ok().bodyValue(status))
                .switchIfEmpty(ServerResponse.notFound().build());
    }

    /**
     * GET /api/v1/roads/{id}/history?from=&to= — historical windows from ClickHouse.
     * Query params default to last 1 hour if not provided.
     */
    public Mono<ServerResponse> getHistory(ServerRequest request) {
        String roadId = request.pathVariable("id");
        Instant from = request.queryParam("from")
                .map(Instant::parse)
                .orElse(Instant.now().minusSeconds(3600));
        Instant to = request.queryParam("to")
                .map(Instant::parse)
                .orElse(Instant.now());

        return Mono.fromCallable(() -> clickHouseRepo.findHistory(roadId, from, to))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(rows -> ServerResponse.ok().bodyValue(rows));
    }

    /**
     * GET /api/v1/roads/{id}/analytics — hourly aggregates for the last 24h from ClickHouse.
     * Demonstrates ClickHouse's toStartOfHour() time-bucket function.
     */
    public Mono<ServerResponse> getAnalytics(ServerRequest request) {
        String roadId = request.pathVariable("id");

        return Mono.fromCallable(() -> clickHouseRepo.findHourlyAnalytics(roadId))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(rows -> ServerResponse.ok().bodyValue(rows));
    }

    /**
     * GET /api/v1/alerts?limit=N — most recent congestion alerts from ClickHouse.
     * Defaults to 50 if the {@code limit} query param is omitted.
     */
    public Mono<ServerResponse> getAlerts(ServerRequest request) {
        int limit = request.queryParam("limit")
                .map(Integer::parseInt)
                .orElse(50);

        return Mono.fromCallable(() -> clickHouseRepo.findAlerts(limit))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(rows -> ServerResponse.ok().bodyValue(rows));
    }
}
