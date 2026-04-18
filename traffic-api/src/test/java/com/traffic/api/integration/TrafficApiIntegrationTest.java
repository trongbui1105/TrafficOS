package com.traffic.api.integration;

import com.traffic.api.kafka.AnalyzedEventConsumer;
import com.traffic.api.model.AlertEvent;
import com.traffic.api.model.RoadHistory;
import com.traffic.api.model.RoadStatus;
import com.traffic.api.repository.CityPulseRepository;
import com.traffic.api.repository.ClickHouseRoadRepository;
import com.traffic.api.repository.RedisRoadRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Integration test for {@code traffic-api}.
 *
 * <p>Uses a <b>real Redis</b> via Testcontainers to verify the full request
 * path: HTTP routing → WebFlux handler → Redis repository → JSON response.
 *
 * <p>External dependencies that are not under test are replaced with Mockito
 * mocks ({@code @MockBean}):
 * <ul>
 *   <li>{@link ClickHouseRoadRepository} — avoids needing a live ClickHouse node</li>
 *   <li>{@link CityPulseRepository}      — same reason</li>
 *   <li>{@link AnalyzedEventConsumer}    — prevents Spring Kafka from registering
 *       a {@code @KafkaListener} (so no broker connection is opened)</li>
 * </ul>
 *
 * <p>The {@code integration-test} Spring profile disables DataSource
 * auto-configuration and Kafka listener auto-startup (see
 * {@code application-integration-test.properties}).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
@ActiveProfiles("integration-test")
@Testcontainers
class TrafficApiIntegrationTest {

    // ---------------------------------------------------------------
    // Testcontainers — real Redis 7
    // ---------------------------------------------------------------

    @Container
    @SuppressWarnings("resource")
    static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                    .withExposedPorts(6379);

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }

    // ---------------------------------------------------------------
    // Mocked external dependencies
    // ---------------------------------------------------------------

    @MockBean
    ClickHouseRoadRepository clickHouseRepo;

    @MockBean
    CityPulseRepository cityPulseRepo;

    @MockBean
    AnalyzedEventConsumer analyzedEventConsumer;

    // ---------------------------------------------------------------
    // Injected test helpers
    // ---------------------------------------------------------------

    @Autowired
    WebTestClient client;

    @Autowired
    RedisRoadRepository redisRepo;

    @Autowired
    ReactiveStringRedisTemplate redisTemplate;

    // ---------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------

    private static RoadStatus nguyenHue() {
        return RoadStatus.builder()
                .roadId("R001")
                .roadName("Nguyen Hue")
                .totalVehicles(120)
                .avgSpeed(22.5)
                .congested(false)
                .updatedAt(Instant.parse("2026-01-01T08:00:00Z"))
                .build();
    }

    private static RoadStatus leLoi() {
        return RoadStatus.builder()
                .roadId("R002")
                .roadName("Le Loi")
                .totalVehicles(200)
                .avgSpeed(8.0)
                .congested(true)
                .updatedAt(Instant.parse("2026-01-01T08:00:00Z"))
                .build();
    }

    // ---------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------

    @BeforeEach
    void setUp() {
        // Flush all road:* keys between tests so each test starts with an empty cache
        redisTemplate.keys("road:*")
                     .collectList()
                     .flatMap(keys -> keys.isEmpty()
                             ? reactor.core.publisher.Mono.just(0L)
                             : redisTemplate.delete(keys.toArray(String[]::new)))
                     .block(java.time.Duration.ofSeconds(5));

        // Default stub returns for ClickHouse (returns empty collections)
        when(clickHouseRepo.findAlerts(anyInt()))
                .thenReturn(List.of());
        when(clickHouseRepo.findHistory(anyString(), any(Instant.class), any(Instant.class)))
                .thenReturn(List.of());
        when(clickHouseRepo.findHourlyAnalytics(anyString()))
                .thenReturn(List.of());
    }

    // ---------------------------------------------------------------
    // Actuator
    // ---------------------------------------------------------------

    @Test
    void actuatorHealth_returnsUp() {
        client.get().uri("/actuator/health")
              .exchange()
              .expectStatus().isOk()
              .expectBody()
              .jsonPath("$.status").isEqualTo("UP");
    }

    // ---------------------------------------------------------------
    // GET /api/v1/roads
    // ---------------------------------------------------------------

    @Test
    void getAllRoads_emptyWhenCacheIsEmpty() {
        client.get().uri("/api/v1/roads")
              .exchange()
              .expectStatus().isOk()
              .expectBodyList(Object.class)
              .hasSize(0);
    }

    @Test
    void getAllRoads_returnsSingleRoadFromCache() {
        redisRepo.save(nguyenHue()).block();

        client.get().uri("/api/v1/roads")
              .exchange()
              .expectStatus().isOk()
              .expectBody()
              .jsonPath("$[0].roadId").isEqualTo("R001")
              .jsonPath("$[0].roadName").isEqualTo("Nguyen Hue")
              .jsonPath("$[0].avgSpeed").isEqualTo(22.5)
              .jsonPath("$[0].congested").isEqualTo(false);
    }

    @Test
    void getAllRoads_returnsMultipleRoadsFromCache() {
        redisRepo.save(nguyenHue()).block();
        redisRepo.save(leLoi()).block();

        List<Map<String, Object>> body = client.get().uri("/api/v1/roads")
              .exchange()
              .expectStatus().isOk()
              .expectBodyList(new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {})
              .returnResult()
              .getResponseBody();

        assertThat(body).hasSize(2);
        assertThat(body).extracting(m -> m.get("roadId"))
                        .containsExactlyInAnyOrder("R001", "R002");
    }

    // ---------------------------------------------------------------
    // GET /api/v1/roads/{id}
    // ---------------------------------------------------------------

    @Test
    void getRoad_returnsRoadForKnownId() {
        redisRepo.save(leLoi()).block();

        client.get().uri("/api/v1/roads/R002")
              .exchange()
              .expectStatus().isOk()
              .expectBody()
              .jsonPath("$.roadId").isEqualTo("R002")
              .jsonPath("$.roadName").isEqualTo("Le Loi")
              .jsonPath("$.congested").isEqualTo(true)
              .jsonPath("$.avgSpeed").isEqualTo(8.0);
    }

    @Test
    void getRoad_returns404ForUnknownId() {
        client.get().uri("/api/v1/roads/NONEXISTENT")
              .exchange()
              .expectStatus().isNotFound();
    }

    // ---------------------------------------------------------------
    // GET /api/v1/alerts
    // ---------------------------------------------------------------

    @Test
    void getAlerts_returnsOkWithEmptyList() {
        client.get().uri("/api/v1/alerts")
              .exchange()
              .expectStatus().isOk()
              .expectBodyList(AlertEvent.class)
              .hasSize(0);
    }

    @Test
    void getAlerts_respectsLimitParam() {
        AlertEvent alert = AlertEvent.builder()
                .roadId("R001").roadName("Nguyen Hue")
                .severity("HIGH").message("Severe congestion")
                .triggeredAt(Instant.now())
                .build();
        when(clickHouseRepo.findAlerts(5)).thenReturn(List.of(alert));

        client.get().uri("/api/v1/alerts?limit=5")
              .exchange()
              .expectStatus().isOk()
              .expectBody()
              .jsonPath("$[0].roadId").isEqualTo("R001")
              .jsonPath("$[0].severity").isEqualTo("HIGH");
    }

    // ---------------------------------------------------------------
    // GET /api/v1/roads/{id}/history
    // ---------------------------------------------------------------

    @Test
    void getHistory_returnsOkWithEmptyList() {
        client.get().uri("/api/v1/roads/R001/history")
              .exchange()
              .expectStatus().isOk()
              .expectBodyList(RoadHistory.class)
              .hasSize(0);
    }

    @Test
    void getHistory_withExplicitTimeRange_returnsOk() {
        client.get().uri(u -> u.path("/api/v1/roads/R001/history")
                               .queryParam("from", "2026-01-01T00:00:00Z")
                               .queryParam("to",   "2026-01-01T01:00:00Z")
                               .build())
              .exchange()
              .expectStatus().isOk();
    }

    // ---------------------------------------------------------------
    // GET /api/v1/roads/{id}/analytics
    // ---------------------------------------------------------------

    @Test
    void getAnalytics_returnsOkWithEmptyList() {
        client.get().uri("/api/v1/roads/R001/analytics")
              .exchange()
              .expectStatus().isOk()
              .expectBodyList(RoadHistory.class)
              .hasSize(0);
    }
}
