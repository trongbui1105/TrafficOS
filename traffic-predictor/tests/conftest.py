"""Pytest configuration — ensures the package root is importable and stubs out
the ClickHouse client so unit tests never hit a live database."""
import sys
import types
from pathlib import Path

# Put the predictor package root on sys.path so `import predictor`, `import models`, etc. resolve.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Stub `clickhouse_client` before `predictor` imports it, so no real client is built.
if "clickhouse_client" not in sys.modules:
    stub = types.ModuleType("clickhouse_client")
    stub.fetch_current_speeds = lambda: []
    stub.fetch_training_data = lambda days=7: []
    stub.insert_predictions = lambda rows: None
    stub.insert_anomalies = lambda rows: None
    stub.get_client = lambda: None
    stub.fetch_recent_windows = lambda road_id, n=10: []
    sys.modules["clickhouse_client"] = stub
