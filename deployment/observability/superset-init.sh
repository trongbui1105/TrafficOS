#!/bin/bash
# Superset first-run initialisation script
# Mounted at /app/docker/docker-init.sh and executed by the official Superset entrypoint

set -e

echo "=== Superset init: upgrading DB ==="
superset db upgrade

echo "=== Superset init: creating admin user ==="
superset fab create-admin \
    --username admin \
    --firstname Traffic \
    --lastname Admin \
    --email admin@traffic.local \
    --password admin \
    2>/dev/null || echo "Admin user already exists, skipping."

echo "=== Superset init: init ==="
superset init

echo "=== Superset init: registering ClickHouse datasource ==="
python - <<'PYEOF'
import requests, time, json

BASE = "http://localhost:8088"
SESSION = requests.Session()

# Login
r = SESSION.post(f"{BASE}/api/v1/security/login", json={
    "username": "admin",
    "password": "admin",
    "provider": "db",
    "refresh": True
})
token = r.json().get("access_token")
if not token:
    print("Could not obtain JWT — skipping datasource registration")
    exit(0)

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "X-CSRFToken": SESSION.get(f"{BASE}/api/v1/security/csrf_token/",
                               headers={"Authorization": f"Bearer {token}"}).json()["result"],
    "Referer": BASE,
}

# Register ClickHouse database
db_payload = {
    "database_name": "ClickHouse Traffic",
    "sqlalchemy_uri": "clickhousedb://default@clickhouse:8123/default",
    "expose_in_sqllab": True,
    "allow_run_async": True,
    "allow_ctas": False,
    "allow_cvas": False,
    "allow_dml": False,
    "extra": json.dumps({"engine_params": {}, "metadata_params": {}, "schemas_allowed_for_file_upload": []}),
}

# Check if already registered
existing = SESSION.get(f"{BASE}/api/v1/database/", headers=headers).json()
names = [d["database_name"] for d in existing.get("result", [])]
if "ClickHouse Traffic" not in names:
    resp = SESSION.post(f"{BASE}/api/v1/database/", json=db_payload, headers=headers)
    if resp.status_code == 201:
        print("ClickHouse datasource registered successfully.")
    else:
        print(f"Warning: could not register datasource ({resp.status_code}): {resp.text}")
else:
    print("ClickHouse datasource already registered, skipping.")
PYEOF

echo "=== Superset init complete ==="
