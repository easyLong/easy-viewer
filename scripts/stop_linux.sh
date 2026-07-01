#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.tmp/easy-viewer.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "easy-viewer is not running: PID file not found."
  exit 0
fi

PID="$(cat "$PID_FILE" || true)"
if [ -z "${PID:-}" ]; then
  rm -f "$PID_FILE"
  echo "easy-viewer is not running: PID file was empty."
  exit 0
fi

if ! kill -0 "$PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "easy-viewer is not running: process $PID not found."
  exit 0
fi

kill "$PID"

for _ in $(seq 1 20); do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "easy-viewer stopped. PID: $PID"
    exit 0
  fi
  sleep 0.5
done

echo "Process $PID did not exit after 10 seconds; forcing stop."
kill -9 "$PID" 2>/dev/null || true
rm -f "$PID_FILE"
echo "easy-viewer stopped. PID: $PID"
