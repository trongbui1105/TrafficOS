# ─── Build stage ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build

# Cache dependencies first (layer invalidated only when pom.xml changes)
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Build the fat jar
COPY src ./src
RUN mvn package -DskipTests -q

# ─── Runtime stage ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# RocksDB (Kafka Streams state store) requires libstdc++.so.6.
# Alpine uses musl libc and doesn't ship it by default — add it explicitly.
RUN apk add --no-cache libstdc++

COPY --from=builder /build/target/traffic-stream-processor-*.jar app.jar

EXPOSE 8090

ENTRYPOINT ["java", "-jar", "app.jar"]
