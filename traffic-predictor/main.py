"""
traffic-predictor — FastAPI service for ML-based traffic forecasting.

Endpoints:
  GET /health                    — service health + model stats
  GET /predict/{road_id}         — per-road forecast (next 30min + 1h)
  GET /predict/city              — city-wide aggregate forecast
  GET /anomalies                 — roads behaving outside historical norm
  GET /roads                     — list all modelled road IDs
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import redis as redis_lib
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from models import AnomalyRecord, CityForecast, HealthResponse, RoadPrediction
from predictor import PredictionEngine

# ── logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── shared state ─────────────────────────────────────────────────────────────
engine = PredictionEngine()

REDIS_HOST   = os.getenv("REDIS_HOST", "redis")
REDIS_PORT   = int(os.getenv("REDIS_PORT", "6379"))
redis_client: Optional[redis_lib.Redis] = None

RETRAIN_INTERVAL_SECONDS   = int(os.getenv("RETRAIN_INTERVAL", "300"))   # 5 min
REFRESH_INTERVAL_SECONDS   = int(os.getenv("REFRESH_INTERVAL", "10"))    # 10 s
PERSIST_INTERVAL_SECONDS   = int(os.getenv("PERSIST_INTERVAL", "60"))    # 1 min


# ── lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client

    # Connect Redis
    try:
        redis_client = redis_lib.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        redis_client.ping()
        logger.info("Redis connected at %s:%s", REDIS_HOST, REDIS_PORT)
    except Exception as exc:
        logger.warning("Redis unavailable: %s — predictions will skip cache", exc)
        redis_client = None

    # Initial train
    logger.info("Initial model training…")
    engine.train()
    engine.refresh_current()

    # Background scheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        lambda: engine.train(),
        "interval", seconds=RETRAIN_INTERVAL_SECONDS,
        id="retrain", max_instances=1,
    )
    scheduler.add_job(
        lambda: engine.refresh_current(),
        "interval", seconds=REFRESH_INTERVAL_SECONDS,
        id="refresh", max_instances=1,
    )
    scheduler.add_job(
        lambda: (engine.persist_predictions(), engine.persist_anomalies()),
        "interval", seconds=PERSIST_INTERVAL_SECONDS,
        id="persist", max_instances=1,
    )
    scheduler.start()
    logger.info(
        "Scheduler started. Retrain=%ds Refresh=%ds Persist=%ds",
        RETRAIN_INTERVAL_SECONDS, REFRESH_INTERVAL_SECONDS, PERSIST_INTERVAL_SECONDS,
    )

    yield

    scheduler.shutdown(wait=False)


# ── app ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Traffic Predictor",
    description="ML-based congestion forecasting and anomaly detection for 572 HCMC roads.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Expose /metrics for Prometheus scraping
Instrumentator().instrument(app).expose(app)


# ── helpers ───────────────────────────────────────────────────────────────────
def _cache_get(key: str) -> Optional[str]:
    if redis_client is None:
        return None
    try:
        return redis_client.get(key)
    except Exception:
        return None


def _cache_set(key: str, value: str, ttl: int = 30) -> None:
    if redis_client is None:
        return
    try:
        redis_client.setex(key, ttl, value)
    except Exception:
        pass


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["Meta"])
async def health():
    return HealthResponse(
        status       = "ok",
        roads_modelled = engine.roads_modelled,
        last_trained = engine.last_trained,
        cache_hit_rate = engine.cache_hit_rate,
    )


@app.get("/roads", tags=["Meta"])
async def list_roads():
    """Return list of road IDs for which we have a model."""
    return {"road_ids": sorted(engine._profiles.keys()), "count": engine.roads_modelled}


@app.get("/predict/city", response_model=CityForecast, response_model_by_alias=True, tags=["Forecast"])
async def predict_city():
    """City-wide aggregate congestion forecast for next 30min and 1h."""
    cache_key = "predict:city"
    cached = _cache_get(cache_key)
    if cached:
        engine._cache_hits += 1
        import json
        return CityForecast.model_validate_json(cached)

    engine._cache_misses += 1
    forecast = engine.predict_city()
    _cache_set(cache_key, forecast.model_dump_json(by_alias=True), ttl=30)
    return forecast


@app.get("/predict/{road_id}", response_model=RoadPrediction, response_model_by_alias=True, tags=["Forecast"])
async def predict_road(road_id: str):
    """Per-road speed forecast for next 30min and 1h with confidence intervals."""
    cache_key = f"predict:{road_id}"
    cached = _cache_get(cache_key)
    if cached:
        engine._cache_hits += 1
        return RoadPrediction.model_validate_json(cached)

    engine._cache_misses += 1
    result = engine.predict_road(road_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No model for road '{road_id}'")

    _cache_set(cache_key, result.model_dump_json(by_alias=True), ttl=30)
    return result


@app.get("/anomalies", response_model=list[AnomalyRecord], response_model_by_alias=True, tags=["Anomalies"])
async def get_anomalies():
    """Roads whose current speed deviates significantly from their historical baseline."""
    cache_key = "anomalies:all"
    cached = _cache_get(cache_key)
    if cached:
        engine._cache_hits += 1
        import json
        data = json.loads(cached)
        return [AnomalyRecord.model_validate(d) for d in data]

    engine._cache_misses += 1
    results = engine.detect_anomalies()
    import json
    _cache_set(cache_key, json.dumps([r.model_dump(by_alias=True, mode="json") for r in results]), ttl=20)
    return results
