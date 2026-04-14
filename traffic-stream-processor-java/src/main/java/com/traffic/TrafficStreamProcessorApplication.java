package com.traffic;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafkaStreams;

@SpringBootApplication
@EnableKafkaStreams
public class TrafficStreamProcessorApplication {

    public static void main(String[] args) {
        SpringApplication.run(TrafficStreamProcessorApplication.class, args);
    }
}
