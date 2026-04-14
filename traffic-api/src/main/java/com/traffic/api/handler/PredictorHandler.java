package com.traffic.api.handler;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;

/**
 * Proxy handler that forwards ML prediction requests to the traffic-predictor
 * Python/FastAPI service and streams the response back to the caller.
 *
 * <p>Using WebClient (reactive HTTP client) means the proxy is fully non-blocking:
 * the Netty event loop is never blocked waiting for the predictor response.
 *
 * <p>Endpoints proxied:
 * <ul>
 *   <li>{@code GET /api/v1/roads/{id}/forecast} → {@code GET /predict/{id}}</li>
 *   <li>{@code GET /api/v1/predict/city}         → {@code GET /predict/city}</li>
 *   <li>{@code GET /api/v1/anomalies}            → {@code GET /anomalies}</li>
 *   <li>{@code GET /api/v1/predictor/health}     → {@code GET /health}</li>
 * </ul>
 */
@Slf4j
@Component
public class PredictorHandler {

    private final WebClient predictorClient;

    public PredictorHandler(@Value("${traffic.predictor.url:http://traffic-predictor:8000}") String predictorUrl) {
        this.predictorClient = WebClient.builder()
                .baseUrl(predictorUrl)
                .codecs(c -> c.defaultCodecs().maxInMemorySize(2 * 1024 * 1024)) // 2 MB
                .build();
        log.info("PredictorHandler configured with upstream: {}", predictorUrl);
    }

    /**
     * {@code GET /api/v1/roads/{id}/forecast}
     * Returns per-road ML speed forecasts (next 30min + 1h with confidence intervals).
     */
    public Mono<ServerResponse> getRoadForecast(ServerRequest request) {
        String roadId = request.pathVariable("id");
        return proxy("/predict/" + roadId);
    }

    /**
     * {@code GET /api/v1/predict/city}
     * Returns city-wide congestion forecast for next 30min and 1h.
     */
    public Mono<ServerResponse> getCityForecast(ServerRequest request) {
        return proxy("/predict/city");
    }

    /**
     * {@code GET /api/v1/anomalies}
     * Returns roads whose current speed deviates significantly from historical norm.
     */
    public Mono<ServerResponse> getAnomalies(ServerRequest request) {
        return proxy("/anomalies");
    }

    /**
     * {@code GET /api/v1/predictor/health}
     * Returns predictor service health including model training stats.
     */
    public Mono<ServerResponse> getPredictorHealth(ServerRequest request) {
        return proxy("/health");
    }

    // ── private ──────────────────────────────────────────────────────────────

    private Mono<ServerResponse> proxy(String path) {
        return predictorClient.get()
                .uri(path)
                .exchangeToMono(upstream ->
                        upstream.bodyToMono(String.class)
                                .defaultIfEmpty("{}")
                                .flatMap(body -> {
                                    if (upstream.statusCode().is2xxSuccessful()) {
                                        return ServerResponse.ok()
                                                .header("Content-Type", "application/json")
                                                .bodyValue(body);
                                    } else if (upstream.statusCode().value() == 404) {
                                        return ServerResponse.notFound().build();
                                    } else {
                                        log.warn("Predictor returned {} for {}", upstream.statusCode(), path);
                                        return ServerResponse.status(upstream.statusCode())
                                                .header("Content-Type", "application/json")
                                                .bodyValue(body);
                                    }
                                })
                )
                .onErrorResume(ex -> {
                    log.error("Predictor proxy error for {}: {}", path, ex.getMessage());
                    return ServerResponse.status(503)
                            .bodyValue("{\"error\":\"Predictor service unavailable\",\"path\":\"" + path + "\"}");
                });
    }
}
