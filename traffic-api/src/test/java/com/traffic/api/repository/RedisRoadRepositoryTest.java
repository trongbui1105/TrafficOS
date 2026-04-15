package com.traffic.api.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.module.paramnames.ParameterNamesModule;
import com.traffic.api.model.RoadStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.ReactiveValueOperations;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.time.Duration;
import java.time.Instant;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RedisRoadRepositoryTest {

    private ReactiveStringRedisTemplate redis;
    private ReactiveValueOperations<String, String> valueOps;
    private RedisRoadRepository repo;
    private ObjectMapper mapper;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(ReactiveStringRedisTemplate.class);
        valueOps = mock(ReactiveValueOperations.class);
        when(redis.opsForValue()).thenReturn(valueOps);

        mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .registerModule(new ParameterNamesModule());
        repo = new RedisRoadRepository(redis, mapper);
        ReflectionTestUtils.setField(repo, "ttlSeconds", 60);
    }

    private RoadStatus sample() {
        return RoadStatus.builder()
                .roadId("R001")
                .roadName("Nguyen Hue")
                .totalVehicles(100)
                .avgSpeed(25.5)
                .congested(true)
                .updatedAt(Instant.parse("2026-01-01T12:00:00Z"))
                .build();
    }

    @Test
    void saveSerialisesAndSetsTtl() {
        when(valueOps.set(anyString(), anyString(), any(Duration.class)))
                .thenReturn(Mono.just(true));

        StepVerifier.create(repo.save(sample()))
                .verifyComplete();

        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Duration> ttl = ArgumentCaptor.forClass(Duration.class);
        verify(valueOps).set(key.capture(), json.capture(), ttl.capture());

        org.junit.jupiter.api.Assertions.assertEquals("road:R001", key.getValue());
        org.junit.jupiter.api.Assertions.assertEquals(Duration.ofSeconds(60), ttl.getValue());
        org.junit.jupiter.api.Assertions.assertTrue(json.getValue().contains("Nguyen Hue"));
        org.junit.jupiter.api.Assertions.assertTrue(json.getValue().contains("R001"));
    }

    @Test
    void findByIdReturnsDeserializedRoadStatus() throws Exception {
        String json = mapper.writeValueAsString(sample());
        when(valueOps.get("road:R001")).thenReturn(Mono.just(json));

        StepVerifier.create(repo.findById("R001"))
                .assertNext(status -> {
                    org.junit.jupiter.api.Assertions.assertEquals("R001", status.getRoadId());
                    org.junit.jupiter.api.Assertions.assertEquals("Nguyen Hue", status.getRoadName());
                    org.junit.jupiter.api.Assertions.assertEquals(25.5, status.getAvgSpeed());
                    org.junit.jupiter.api.Assertions.assertTrue(status.isCongested());
                })
                .verifyComplete();
    }

    @Test
    void findByIdEmptyWhenMissing() {
        when(valueOps.get("road:R999")).thenReturn(Mono.empty());

        StepVerifier.create(repo.findById("R999"))
                .verifyComplete();
    }

    @Test
    void findAllReturnsAllCachedRoads() throws Exception {
        String json1 = mapper.writeValueAsString(sample());
        RoadStatus r2 = RoadStatus.builder()
                .roadId("R002").roadName("Le Loi")
                .totalVehicles(50).avgSpeed(40.0).congested(false)
                .updatedAt(Instant.now()).build();
        String json2 = mapper.writeValueAsString(r2);

        when(redis.keys("road:*")).thenReturn(Flux.just("road:R001", "road:R002"));
        when(valueOps.get("road:R001")).thenReturn(Mono.just(json1));
        when(valueOps.get("road:R002")).thenReturn(Mono.just(json2));

        StepVerifier.create(repo.findAll())
                .expectNextCount(2)
                .verifyComplete();
    }
}
