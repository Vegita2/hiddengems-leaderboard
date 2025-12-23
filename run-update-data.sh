#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from datetime import date, timedelta
import subprocess

start = date(2025, 10, 7)
today = date.today()

d = start
while d <= today:
    day = d.isoformat()
    subprocess.check_call(["node", "update-data.ts", day])
    d += timedelta(days=1)
PY
