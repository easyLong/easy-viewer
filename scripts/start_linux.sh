#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${EASY_VIEWER_HOST:-127.0.0.1}"
PORT="${EASY_VIEWER_PORT:-8898}"
PID_FILE="$ROOT_DIR/.tmp/easy-viewer.pid"
OUT_LOG="$ROOT_DIR/.tmp/easy-viewer.out.log"
ERR_LOG="$ROOT_DIR/.tmp/easy-viewer.err.log"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"

mkdir -p "$ROOT_DIR/.tmp"
cd "$ROOT_DIR"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [ -n "${OLD_PID:-}" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "easy-viewer is already running. PID: $OLD_PID"
    echo "URL: http://$HOST:$PORT"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if [ ! -x "$PYTHON_BIN" ]; then
  python3 -m venv "$ROOT_DIR/.venv"
fi

"$PYTHON_BIN" -m pip install -e .

export PYTHONPATH="$ROOT_DIR"

nohup "$PYTHON_BIN" -m uvicorn post_viewer.api:app \
  --host "$HOST" \
  --port "$PORT" \
  >"$OUT_LOG" 2>"$ERR_LOG" &

PID="$!"
echo "$PID" > "$PID_FILE"

echo "easy-viewer started."
echo "PID: $PID"
echo "URL: http://$HOST:$PORT"
echo "Logs:"
echo "  $OUT_LOG"
echo "  $ERR_LOG"
