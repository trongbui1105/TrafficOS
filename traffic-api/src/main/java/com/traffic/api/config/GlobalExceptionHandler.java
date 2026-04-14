package com.traffic.api.config;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebExceptionHandler;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * Catches unhandled exceptions from all functional handlers and maps them to
 * appropriate HTTP status codes instead of the default 500.
 *
 * <p>Key mappings:
 * <ul>
 *   <li>ClickHouse MEMORY_LIMIT_EXCEEDED (code 241) → 503 Service Unavailable</li>
 *   <li>Any ClickHouse / JDBC / DB exception              → 503 Service Unavailable</li>
 *   <li>Anything else                                     → 500 Internal Server Error</li>
 * </ul>
 *
 * <p>Ordered at -1 so it runs after Spring's built-in WebFlux exception handlers
 * (which handle codec errors, response-already-committed, etc.) but before the
 * default {@code ResponseStatusExceptionHandler}.
 */
@Slf4j
@Component
@Order(-1)
@RequiredArgsConstructor
public class GlobalExceptionHandler implements WebExceptionHandler {

    private final ObjectMapper objectMapper;

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        HttpStatus status;
        String message;

        if (isDatastoreException(ex)) {
            status  = HttpStatus.SERVICE_UNAVAILABLE;
            message = "Database temporarily unavailable — please retry in a moment";
            log.warn("ClickHouse error on {}: {}", exchange.getRequest().getPath(), rootMessage(ex));
        } else {
            status  = HttpStatus.INTERNAL_SERVER_ERROR;
            message = "Internal server error";
            log.error("Unhandled error on {}: {}", exchange.getRequest().getPath(), ex.getMessage(), ex);
        }

        byte[] body;
        try {
            body = objectMapper.writeValueAsBytes(Map.of(
                    "error",  message,
                    "status", status.value(),
                    "path",   exchange.getRequest().getPath().value()
            ));
        } catch (JsonProcessingException e) {
            body = ("{\"error\":\"" + message + "\"}").getBytes();
        }

        exchange.getResponse().setStatusCode(status);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        DataBuffer buffer = exchange.getResponse().bufferFactory().wrap(body);
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    /** Returns true when the root cause is a ClickHouse or JDBC connection error. */
    private static boolean isDatastoreException(Throwable t) {
        Throwable cursor = t;
        while (cursor != null) {
            String name = cursor.getClass().getName();
            String msg  = cursor.getMessage() != null ? cursor.getMessage() : "";
            if (name.contains("ClickHouse")
                    || name.contains("clickhouse")
                    || name.contains("SQLException")
                    || name.contains("DataAccessException")
                    || name.contains("JdbcException")
                    || msg.contains("MEMORY_LIMIT_EXCEEDED")
                    || msg.contains("Code: 241")
                    || msg.contains("memory limit exceeded")) {
                return true;
            }
            cursor = cursor.getCause();
        }
        return false;
    }

    private static String rootMessage(Throwable t) {
        Throwable root = t;
        while (root.getCause() != null) root = root.getCause();
        return root.getMessage();
    }
}
