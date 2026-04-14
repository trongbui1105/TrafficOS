package com.traffic.api.model;

import lombok.Builder;
import lombok.Data;

/**
 * Envelope for all WebSocket messages sent to connected clients.
 *
 * <pre>
 * { "type": "road_update", "data": { ... } }
 * { "type": "alert",       "data": { ... } }
 * </pre>
 */
@Data
@Builder
public class WebSocketMessage {
    /** Discriminator: "road_update" or "alert". */
    private String type;
    /** Payload — a RoadStatus or alert JSON object. */
    private Object data;
}
