"""Unit tests for the ML prediction engine."""
from datetime import datetime, timezone

import pytest

from predictor import PredictionEngine, RoadProfile, CONGESTED_THRESH


class TestRoadProfile:
    def test_initial_state_zero_samples(self):
        p = RoadProfile("R001", "Test")
        assert p.sample_count == 0
        assert p.confidence == "low"

    def test_add_increments_count(self):
        p = RoadProfile("R001", "Test")
        p.add(hour=8, dow=1, avg_speed=25.0)
        p.add(hour=8, dow=1, avg_speed=30.0)
        assert p.sample_count == 2

    def test_baseline_returns_mean_and_std(self):
        p = RoadProfile("R001", "Test")
        for s in (10.0, 20.0, 30.0):
            p.add(hour=8, dow=1, avg_speed=s)
        mean, std = p.baseline(8, 1)
        assert mean == pytest.approx(20.0, abs=1e-6)
        assert std > 0

    def test_baseline_falls_back_to_same_hour_any_day(self):
        p = RoadProfile("R001", "Test")
        p.add(hour=8, dow=2, avg_speed=25.0)  # Tuesday only
        mean, _ = p.baseline(8, 5)  # Friday — fallback to hour=8 across days
        assert mean == pytest.approx(25.0, abs=1e-6)

    def test_baseline_falls_back_to_global(self):
        p = RoadProfile("R001", "Test")
        p.add(hour=3, dow=1, avg_speed=50.0)  # different hour
        mean, _ = p.baseline(15, 3)
        assert mean == pytest.approx(50.0, abs=1e-6)

    def test_baseline_empty_profile_returns_defaults(self):
        p = RoadProfile("R001", "Test")
        mean, std = p.baseline(8, 1)
        assert mean == 25.0
        assert std == 8.0

    def test_confidence_levels(self):
        p = RoadProfile("R001", "Test")
        for _ in range(50):
            p.add(8, 1, 20.0)
        assert p.confidence == "low"

        for _ in range(60):
            p.add(8, 1, 20.0)  # now 110 total
        assert p.confidence == "medium"

        for _ in range(400):
            p.add(8, 1, 20.0)  # now 510 total
        assert p.confidence == "high"


class TestCongestionProb:
    def test_mean_far_below_threshold_probability_near_one(self):
        p = PredictionEngine._congestion_prob(mean=5.0, std=3.0)
        assert p > 0.9

    def test_mean_far_above_threshold_probability_near_zero(self):
        p = PredictionEngine._congestion_prob(mean=60.0, std=3.0)
        assert p < 0.1

    def test_mean_at_threshold_probability_near_half(self):
        p = PredictionEngine._congestion_prob(mean=CONGESTED_THRESH, std=5.0)
        assert 0.4 < p < 0.6

    def test_zero_std_does_not_divide_by_zero(self):
        # Engine uses max(std, 1e-6) so should not NaN/raise
        p = PredictionEngine._congestion_prob(mean=10.0, std=0.0)
        assert 0.0 <= p <= 1.0


class TestPredictionEngine:
    def test_empty_engine_has_zero_roads(self):
        e = PredictionEngine()
        assert e.roads_modelled == 0
        assert e.cache_hit_rate == 0.0

    def test_predict_road_returns_none_for_unknown(self):
        e = PredictionEngine()
        assert e.predict_road("R999") is None

    def test_predict_road_returns_prediction_with_forecasts(self):
        e = PredictionEngine()
        profile = RoadProfile("R001", "Nguyen Hue")
        # Seed plenty of baseline data across all hours and days
        for h in range(24):
            for d in range(1, 8):
                for s in (25.0, 30.0, 28.0, 32.0):
                    profile.add(h, d, s)
        e._profiles["R001"] = profile
        e._current["R001"] = {"road_id": "R001", "avg_speed": 27.0, "congested": False}

        pred = e.predict_road("R001")
        assert pred is not None
        assert pred.road_id == "R001"
        assert pred.road_name == "Nguyen Hue"
        assert len(pred.next_1h) == 9    # HORIZONS_MIN has 9 entries
        assert len(pred.next_30min) >= 1
        assert all(5.0 <= f.predicted_avg_speed <= 80.0 for f in pred.next_1h)
        assert all(f.lower_bound <= f.predicted_avg_speed <= f.upper_bound for f in pred.next_1h)
        assert pred.trend_direction in ("rising", "falling", "stable")
        assert pred.confidence in ("low", "medium", "high")

    def test_detect_anomalies_requires_sufficient_samples(self):
        e = PredictionEngine()
        profile = RoadProfile("R001", "Test")
        for _ in range(10):  # below the 50-sample threshold
            profile.add(datetime.now(tz=timezone.utc).hour, 1, 25.0)
        e._profiles["R001"] = profile
        e._current["R001"] = {"road_id": "R001", "avg_speed": 5.0, "congested": True, "road_name": "Test"}

        assert e.detect_anomalies() == []

    def test_detect_anomalies_flags_extreme_deviation(self):
        e = PredictionEngine()
        profile = RoadProfile("R001", "Test")
        now = datetime.now(tz=timezone.utc)
        hour, dow = now.hour, now.isoweekday()
        # Tight cluster around 30 km/h
        for _ in range(100):
            profile.add(hour, dow, 30.0)
            profile.add(hour, dow, 29.5)
            profile.add(hour, dow, 30.5)
        e._profiles["R001"] = profile
        # Current speed is wildly different → should flag
        e._current["R001"] = {
            "road_id": "R001",
            "avg_speed": 5.0,
            "congested": True,
            "road_name": "Test",
        }
        anomalies = e.detect_anomalies()
        assert len(anomalies) == 1
        assert anomalies[0].anomaly_type == "slow_anomaly"
        assert anomalies[0].severity in ("LOW", "MEDIUM", "HIGH")

    def test_compute_trend_returns_bounded_slope(self):
        e = PredictionEngine()
        profile = RoadProfile("R001", "Test")
        for h in range(24):
            profile.add(h, 1, 30.0)
        e._profiles["R001"] = profile

        slope = e._compute_trend("R001", fallback=30.0)
        assert -2.0 <= slope <= 2.0

    def test_compute_trend_missing_road_returns_zero(self):
        e = PredictionEngine()
        assert e._compute_trend("R999", 25.0) == 0.0
