package com.traffic.api.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.test.StepVerifier;

import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler =
            new GlobalExceptionHandler(new ObjectMapper());

    private MockServerWebExchange exchange() {
        return MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/roads/R001/history"));
    }

    @Test
    void mapsGenericExceptionTo500() {
        MockServerWebExchange ex = exchange();
        StepVerifier.create(handler.handle(ex, new IllegalStateException("boom")))
                .verifyComplete();
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, ex.getResponse().getStatusCode());
    }

    @Test
    void mapsSqlExceptionTo503() {
        MockServerWebExchange ex = exchange();
        StepVerifier.create(handler.handle(ex, new SQLException("connection refused")))
                .verifyComplete();
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getResponse().getStatusCode());
    }

    @Test
    void mapsMemoryLimitMessageTo503() {
        RuntimeException cause = new RuntimeException("Code: 241. DB::Exception: Memory limit (MEMORY_LIMIT_EXCEEDED)");
        MockServerWebExchange ex = exchange();
        StepVerifier.create(handler.handle(ex, new RuntimeException(cause)))
                .verifyComplete();
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getResponse().getStatusCode());
    }

    @Test
    void walksCauseChainToFindClickHouseException() {
        // An exception whose class name contains "SQLException" deep in the cause chain
        Throwable root = new SQLException("query timed out");
        Throwable mid = new RuntimeException("wrapper", root);
        Throwable top = new RuntimeException("outer", mid);

        MockServerWebExchange ex = exchange();
        StepVerifier.create(handler.handle(ex, top)).verifyComplete();
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getResponse().getStatusCode());
    }

    @Test
    void sendsJsonErrorBody() {
        MockServerWebExchange ex = exchange();
        StepVerifier.create(handler.handle(ex, new RuntimeException("oops")))
                .verifyComplete();
        assertEquals("application/json",
                ex.getResponse().getHeaders().getContentType().toString());
    }
}
