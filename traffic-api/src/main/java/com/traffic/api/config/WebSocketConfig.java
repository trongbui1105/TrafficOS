package com.traffic.api.config;

import com.traffic.api.handler.LiveWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.server.support.WebSocketHandlerAdapter;

import java.util.Map;

/**
 * Registers the WebSocket endpoint {@code /ws/live} using Spring WebFlux's
 * reactive WebSocket support (non-blocking, runs on Netty).
 *
 * <p>Unlike the Servlet-stack WebSocket (Tomcat), this approach uses
 * {@link org.springframework.web.reactive.socket.WebSocketSession} which
 * returns {@code Flux<WebSocketMessage>} — fully reactive end-to-end.
 */
@Configuration
@RequiredArgsConstructor
public class WebSocketConfig {

    private final LiveWebSocketHandler liveWebSocketHandler;

    @Bean
    public HandlerMapping webSocketHandlerMapping() {
        Map<String, WebSocketHandler> map = Map.of("/ws/live", liveWebSocketHandler);

        SimpleUrlHandlerMapping mapping = new SimpleUrlHandlerMapping();
        mapping.setUrlMap(map);
        mapping.setOrder(-1); // higher priority than other mappings
        return mapping;
    }

    @Bean
    public WebSocketHandlerAdapter handlerAdapter() {
        return new WebSocketHandlerAdapter();
    }
}
