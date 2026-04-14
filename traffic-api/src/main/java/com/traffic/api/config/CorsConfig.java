package com.traffic.api.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.config.CorsRegistry;
import org.springframework.web.reactive.config.WebFluxConfigurer;

/**
 * Global CORS configuration for the Spring WebFlux (Netty) server.
 *
 * <p>Allows the Next.js dashboard (localhost:3000) and any other origin to call
 * the REST API and upgrade to WebSocket without being blocked by browser CORS policy.
 *
 * <p>In production, replace the wildcard origin with the actual frontend domain.
 */
@Configuration
public class CorsConfig implements WebFluxConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")   // allow all origins (lock down in production)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
