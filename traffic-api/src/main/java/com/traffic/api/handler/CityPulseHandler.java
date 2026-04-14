package com.traffic.api.handler;

import com.traffic.api.repository.CityPulseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * Functional handlers for the enrichment datasets produced by traffic-simulator.
 *
 * <p>All endpoints offload blocking ClickHouse JDBC queries onto
 * {@code boundedElastic} so Netty's event loop stays free.
 */
@Component
@RequiredArgsConstructor
public class CityPulseHandler {

    private final CityPulseRepository repo;

    /** {@code GET /api/v1/city/pulse} — one-shot aggregated snapshot. */
    public Mono<ServerResponse> getPulse(ServerRequest request) {
        return Mono.fromCallable(repo::buildSnapshot)
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(body -> ServerResponse.ok().bodyValue(body));
    }

    /** {@code GET /api/v1/incidents/active} — list currently active incidents. */
    public Mono<ServerResponse> getActiveIncidents(ServerRequest request) {
        int limit = request.queryParam("limit").map(Integer::parseInt).orElse(100);
        return Mono.fromCallable(() -> repo.findActiveIncidents(limit))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(body -> ServerResponse.ok().bodyValue(body));
    }

    /** {@code GET /api/v1/weather} — latest weather per road. */
    public Mono<ServerResponse> getAllWeather(ServerRequest request) {
        return Mono.fromCallable(repo::findAllLatestWeather)
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(body -> ServerResponse.ok().bodyValue(body));
    }

    /** {@code GET /api/v1/roads/{id}/weather} — latest weather for a single road. */
    public Mono<ServerResponse> getWeather(ServerRequest request) {
        String roadId = request.pathVariable("id");
        return Mono.fromCallable(() -> repo.findLatestWeather(roadId))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(row -> row == null
                        ? ServerResponse.notFound().build()
                        : ServerResponse.ok().bodyValue(row));
    }

    /** {@code GET /api/v1/roads/{id}/vehicle-mix?limit=} — vehicle classification history. */
    public Mono<ServerResponse> getVehicleMix(ServerRequest request) {
        String roadId = request.pathVariable("id");
        int limit = request.queryParam("limit").map(Integer::parseInt).orElse(60);
        return Mono.fromCallable(() -> repo.findVehicleMixHistory(roadId, limit))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(body -> ServerResponse.ok().bodyValue(body));
    }

    /** {@code GET /api/v1/roads/{id}/environment?limit=} — air-quality + noise history. */
    public Mono<ServerResponse> getEnvironment(ServerRequest request) {
        String roadId = request.pathVariable("id");
        int limit = request.queryParam("limit").map(Integer::parseInt).orElse(60);
        return Mono.fromCallable(() -> repo.findEnvironmentHistory(roadId, limit))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(body -> ServerResponse.ok().bodyValue(body));
    }

    /** {@code GET /api/v1/roads/meta} — static road metadata (district, lanes, coords…). */
    public Mono<ServerResponse> getRoadMeta(ServerRequest request) {
        return Mono.fromCallable(repo::findAllRoadMeta)
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(body -> ServerResponse.ok().bodyValue(body));
    }
}
