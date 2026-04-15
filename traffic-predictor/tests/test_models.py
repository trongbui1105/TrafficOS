"""Tests for pydantic model alias generation — critical to UI compatibility."""
from datetime import datetime, timezone

import pytest

from models import (
    AnomalyRecord,
    CityForecast,
    RoadPrediction,
    SpeedForecast,
    _to_camel,
)


class TestToCamel:
    def test_simple_snake_case(self):
        assert _to_camel("road_id") == "roadId"
        assert _to_camel("road_name") == "roadName"

    def test_single_segment_returned_as_is(self):
        assert _to_camel("timestamp") == "timestamp"

    def test_digit_prefix_not_capitalised(self):
        """Regression: 'next_30min' must become 'next30min', NOT 'next30Min'."""
        assert _to_camel("next_30min") == "next30min"
        assert _to_camel("next_1h") == "next1h"

    def test_mixed_with_digit_segment(self):
        assert _to_camel("city_avg_speed_30min") == "cityAvgSpeed30min"
        assert _to_camel("next_30min_congestion_pct") == "next30minCongestionPct"
        assert _to_camel("next_1h_congestion_pct") == "next1hCongestionPct"

    def test_multi_word_camel(self):
        assert _to_camel("historical_mean") == "historicalMean"
        assert _to_camel("predicted_avg_speed") == "predictedAvgSpeed"


class TestSpeedForecast:
    def test_serialises_with_camel_aliases(self):
        f = SpeedForecast(
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
            predicted_avg_speed=25.5,
            lower_bound=20.0,
            upper_bound=30.0,
            congestion_probability=0.15,
        )
        dumped = f.model_dump(by_alias=True)
        assert "predictedAvgSpeed" in dumped
        assert "lowerBound" in dumped
        assert "upperBound" in dumped
        assert "congestionProbability" in dumped

    def test_accepts_snake_case_on_construction(self):
        # populate_by_name=True allows snake_case input
        f = SpeedForecast(
            timestamp=datetime.now(tz=timezone.utc),
            predicted_avg_speed=30.0,
            lower_bound=25.0,
            upper_bound=35.0,
            congestion_probability=0.1,
        )
        assert f.predicted_avg_speed == 30.0


class TestRoadPrediction:
    def test_camel_aliases_include_digit_prefixed_fields(self):
        p = RoadPrediction(
            road_id="R001",
            road_name="Nguyen Hue",
            generated_at=datetime.now(tz=timezone.utc),
            current_avg_speed=25.0,
            current_congested=True,
            next_30min=[],
            next_1h=[],
            historical_mean=30.0,
            historical_std=5.0,
            trend_direction="stable",
            confidence="high",
        )
        dumped = p.model_dump(by_alias=True)
        assert "next30min" in dumped   # NOT next30Min
        assert "next1h" in dumped       # NOT next1H
        assert "roadId" in dumped
        assert "historicalMean" in dumped


class TestCityForecast:
    def test_all_city_aliases(self):
        c = CityForecast(
            generated_at=datetime.now(tz=timezone.utc),
            next_30min_congestion_pct=45.0,
            next_1h_congestion_pct=50.0,
            peak_roads=["R001"],
            improving_roads=["R002"],
            city_avg_speed_now=25.0,
            city_avg_speed_30min=26.0,
            city_avg_speed_1h=27.0,
        )
        dumped = c.model_dump(by_alias=True)
        assert "next30minCongestionPct" in dumped
        assert "next1hCongestionPct" in dumped
        assert "cityAvgSpeedNow" in dumped
        assert "cityAvgSpeed30min" in dumped
        assert "cityAvgSpeed1h" in dumped


class TestAnomalyRecord:
    def test_round_trip_json(self):
        a = AnomalyRecord(
            road_id="R001",
            road_name="Le Loi",
            detected_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            current_speed=5.0,
            expected_speed=30.0,
            deviation_sigma=3.5,
            anomaly_type="slow_anomaly",
            severity="HIGH",
        )
        json = a.model_dump_json(by_alias=True)
        assert '"roadId":"R001"' in json
        assert '"deviationSigma"' in json
        assert '"anomalyType":"slow_anomaly"' in json
