#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${EASY_VIEWER_HOST:-127.0.0.1}"
PORT="${EASY_VIEWER_PORT:-8898}"
PID_FILE="$ROOT_DIR/.tmp/easy-viewer.pid"
HEALTH_URL="http://$HOST:$PORT/health"

if [ ! -f "$PID_FILE" ]; then
  echo "Status: stopped"
  echo "PID file: missing"
  exit 0
fi

PID="$(cat "$PID_FILE" || true)"
if [ -z "${PID:-}" ] || ! kill -0 "$PID" 2>/dev/null; then
  echo "Status: stopped"
  echo "PID file: $PID_FILE"
  echo "Recorded PID: ${PID:-empty}"
  exit 0
fi

echo "Status: running"
echo "PID: $PID"
echo "URL: http://$HOST:$PORT"

if command -v curl >/dev/null 2>&1; then
  echo "Health:"
  curl -fsS "$HEALTH_URL" || true
  echo
else
  echo "Health: curl not installed; skipped"
fi
