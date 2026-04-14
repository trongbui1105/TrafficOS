package com.traffic.alert;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

@SpringBootApplication
@EnableKafka
public class TrafficAlertEngineApplication {

    public static void main(String[] args) {
        SpringApplication.run(TrafficAlertEngineApplication.class, args);
    }
}
