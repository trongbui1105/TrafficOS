package com.traffic.api.config;

import com.traffic.api.handler.CityPulseHandler;
import com.traffic.api.handler.PredictorHandler;
import com.traffic.api.handler.RoadHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerResponse;

/**
 * Defines all REST routes using Spring WebFlux's functional router DSL.
 *
 * <p>This is equivalent to {@code @RequestMapping} annotations but keeps
 * routing and business logic cleanly separated.
 */
@Configuration
public class RouterConfig {

    @Bean
    public RouterFunction<ServerResponse> routes(RoadHandler roadHandler,
                                                 CityPulseHandler cityHandler,
                                                 PredictorHandler predictorHandler) {
        return RouterFunctions.route()
                // --- traffic & alert routes ---
                .GET("/api/v1/roads",                       roadHandler::getAllRoads)
                .GET("/api/v1/roads/meta",                  cityHandler::getRoadMeta)
                .GET("/api/v1/roads/{id}",                  roadHandler::getRoad)
                .GET("/api/v1/roads/{id}/history",          roadHandler::getHistory)
                .GET("/api/v1/roads/{id}/analytics",        roadHandler::getAnalytics)
                .GET("/api/v1/roads/{id}/weather",          cityHandler::getWeather)
                .GET("/api/v1/roads/{id}/vehicle-mix",      cityHandler::getVehicleMix)
                .GET("/api/v1/roads/{id}/environment",      cityHandler::getEnvironment)
                .GET("/api/v1/alerts",                      roadHandler::getAlerts)

                // --- enrichment datasets ---
                .GET("/api/v1/city/pulse",                  cityHandler::getPulse)
                .GET("/api/v1/incidents/active",            cityHandler::getActiveIncidents)
                .GET("/api/v1/weather",                     cityHandler::getAllWeather)

                // --- ML prediction proxy (forwards to traffic-predictor) ---
                .GET("/api/v1/roads/{id}/forecast",         predictorHandler::getRoadForecast)
                .GET("/api/v1/predict/city",                predictorHandler::getCityForecast)
                .GET("/api/v1/anomalies",                   predictorHandler::getAnomalies)
                .GET("/api/v1/predictor/health",            predictorHandler::getPredictorHealth)

                .build();
    }
}
