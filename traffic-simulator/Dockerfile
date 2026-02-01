# Stage 1: Build binary
FROM golang:1.23-alpine AS build

WORKDIR /app

# Copy modules files first
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

ARG TARGETOS
ARG TARGETARCH

# Build binary into a known folder
RUN CGO_ENABLED=0 \
    GOOS=${TARGETOS:-linux} \
    GOARCH=${TARGETARCH:-amd64} \
    go build -o /app/simulator ./cmd/simulator

# Stage 2: Create minimal runtime image
FROM gcr.io/distroless/base-debian12

WORKDIR /app

# COPY compiled binary
COPY --from=build /app/simulator .

# COPY road name files
COPY data ./data

# RUN simulator
CMD ["./simulator"]