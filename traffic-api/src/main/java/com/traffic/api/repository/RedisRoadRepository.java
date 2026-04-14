package com.traffic.api.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traffic.api.model.RoadStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * Stores current road status in Redis as JSON strings.
 *
 * <p>Key pattern: {@code road:<roadId>}
 * <p>TTL: 60 seconds — if no update arrives, the road is considered stale.
 *
 * <p>Uses {@link ReactiveStringRedisTemplate} to stay non-blocking on Netty's
 * event loop (consistent with Spring WebFlux's reactive programming model).
 */
@Slf4j
@Repository
@RequiredArgsConstructor
public class RedisRoadRepository {

    private static final String KEY_PREFIX = "road:";

    private final ReactiveStringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${traffic.redis.road-ttl-seconds:60}")
    private int ttlSeconds;

    public Mono<Void> save(RoadStatus status) {
        String key = KEY_PREFIX + status.getRoadId();
        return Mono.fromCallable(() -> objectMapper.writeValueAsString(status))
                .flatMap(json -> redisTemplate.opsForValue()
                        .set(key, json, Duration.ofSeconds(ttlSeconds)))
                .then();
    }

    public Mono<RoadStatus> findById(String roadId) {
        return redisTemplate.opsForValue()
                .get(KEY_PREFIX + roadId)
                .flatMap(json -> Mono.fromCallable(() ->
                        objectMapper.readValue(json, RoadStatus.class)));
    }

    /** Returns all roads currently cached (scans keys matching {@code road:*}). */
    public Flux<RoadStatus> findAll() {
        return redisTemplate.keys(KEY_PREFIX + "*")
                .flatMap(key -> redisTemplate.opsForValue().get(key))
                .flatMap(json -> Mono.fromCallable(() ->
                        objectMapper.readValue(json, RoadStatus.class)));
    }
}
