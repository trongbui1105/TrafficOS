"""Pydantic models for the traffic-predictor API."""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


def _to_camel(s: str) -> str:
    """snake_case → camelCase, but do NOT capitalise the first letter of a
    segment that begins with a digit (e.g. '30min' stays '30min', not '30Min').
    This matches the TypeScript interface naming convention used in the dashboard.

    Examples:
        road_id              → roadId
        next_30min           → next30min      (not next30Min)
        next_1h              → next1h         (not next1H)
        city_avg_speed_30min → cityAvgSpeed30min
        next_30min_cong_pct  → next30minCongPct
    """
    parts = s.split("_")
    return parts[0] + "".join(
        p if (p and p[0].isdigit()) else p.capitalize()
        for p in parts[1:]
    )


class _CamelModel(BaseModel):
    """Base class that serialises all fields as camelCase so the frontend
    TypeScript types (which use camelCase) work without any transformation."""
    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,   # still accept snake_case on construction
    )


class SpeedForecast(_CamelModel):
    """Single forecasted speed data-point."""
    timestamp: datetime
    predicted_avg_speed: float = Field(description="Predicted avg speed km/h")
    lower_bound: float = Field(description="80% confidence lower bound")
    upper_bound: float = Field(description="80% confidence upper bound")
    congestion_probability: float = Field(description="P(avg_speed < 20 km/h) [0-1]")


class RoadPrediction(_CamelModel):
    """Full prediction response for a single road."""
    road_id: str
    road_name: str
    generated_at: datetime
    current_avg_speed: Optional[float]
    current_congested: Optional[bool]
    next_30min: list[SpeedForecast]
    next_1h: list[SpeedForecast]
    historical_mean: float
    historical_std: float
    trend_direction: str  # rising | falling | stable
    confidence: str       # high | medium | low


class AnomalyRecord(_CamelModel):
    """A road behaving outside its historical norm."""
    road_id: str
    road_name: str
    detected_at: datetime
    current_speed: float
    expected_speed: float
    deviation_sigma: float
    anomaly_type: str     # slow_anomaly | fast_anomaly
    severity: str         # LOW | MEDIUM | HIGH


class CityForecast(_CamelModel):
    """City-wide aggregate forecast."""
    generated_at: datetime
    next_30min_congestion_pct: float
    next_1h_congestion_pct: float
    peak_roads: list[str]
    improving_roads: list[str]
    city_avg_speed_now: float
    city_avg_speed_30min: float
    city_avg_speed_1h: float


class HealthResponse(BaseModel):
    status: str
    roads_modelled: int
    last_trained: Optional[datetime]
    cache_hit_rate: float
