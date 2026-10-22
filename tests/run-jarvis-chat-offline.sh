#!/usr/bin/env bash
set -euo pipefail
# Stage 14 runtime smoke test. Local Wrangler only; no Gemini secret or real data.
PORT=8796
ROOT="$(mktemp -d)"
PID=""
cleanup() {
 if [ -n "$PID" ]; then
  kill -TERM -- "-$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
 fi
 rm -rf "$ROOT"
}
trap cleanup EXIT
setsid npx --yes wrangler@4.45.0 dev --local \
 --config worker/wrangler.chat-lab.toml --port "$PORT" \
 --persist-to "$ROOT/state" > "$ROOT/server.log" 2>&1 &
PID="$!"
ready=0
for attempt in $(seq 1 90); do
 code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 \
  -X OPTIONS -H 'Origin: https://sigma-61328--jarvis-lab-pw5dmfbc.web.app' \
  "http://127.0.0.1:$PORT/api/lab/chat" || true)"
 if [ "$code" = "204" ]; then ready=1;break;fi
 if ! kill -0 "$PID" 2>/dev/null; then tail -n 80 "$ROOT/server.log";exit 1;fi
 sleep 1
done
if [ "$ready" != 1 ]; then tail -n 80 "$ROOT/server.log";exit 1;fi
sleep 3
SIGMA_CHAT_LAB_URL="http://127.0.0.1:$PORT" node tests/chat-lab-http.mjs
echo "CHAT_LAB_OFFLINE_WORKER_OK"
