package com.traffic.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

@SpringBootApplication
@EnableKafka
public class TrafficApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(TrafficApiApplication.class, args);
    }
}
