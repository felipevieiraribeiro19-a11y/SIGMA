#!/usr/bin/env bash
set -euo pipefail
# OFFLINE ONLY: NO DEPLOY, NO CLOUDFLARE ACCOUNT, NO SECRETS.
PORT=8795
export SIGMA_LAB_PORT="$PORT"
ROOT="$(mktemp -d)"
PERSIST_DIR="$ROOT/state"
LOG="$ROOT/wrangler.log"
PID=""
mkdir -p "$PERSIST_DIR"

stop_worker() {
  if [ -n "$PID" ]; then
    kill -TERM -- "-$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
    PID=""
  fi
}
cleanup() {
  stop_worker
  rm -rf "$ROOT" # Contains fictional test data only.
}
trap cleanup EXIT

start_worker() {
  # New process group lets the test stop Wrangler and workerd together.
  setsid npx --yes wrangler@4.45.0 dev --local \
    --config worker/wrangler.offline-lab.toml \
    --port "$PORT" --persist-to "$PERSIST_DIR" > "$LOG" 2>&1 &
  PID=$!
  local ready=0
  for attempt in $(seq 1 90); do
    if curl --silent --fail --max-time 2 -H 'X-SIGMA-LAB: offline-fixture' \
      "http://127.0.0.1:$PORT/offline-lab/health" \
      | grep -q '"actionsEnabled":false'; then
      ready=1
      break
    fi
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "Wrangler stopped before becoming ready:"
      tail -n 80 "$LOG"
      exit 1
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "Offline Worker failed readiness:"
    tail -n 100 "$LOG"
    exit 1
  fi
  # Wrangler may perform one final local workerd reload immediately after its
  # first successful health response. Avoid a POST during that reload window.
  sleep 5
  if ! curl --silent --fail --max-time 3 -H 'X-SIGMA-LAB: offline-fixture' \
    "http://127.0.0.1:$PORT/offline-lab/health" \
    | grep -q '"actionsEnabled":false'; then
    echo "Offline Worker did not stabilize after readiness:"
    tail -n 100 "$LOG"
    exit 1
  fi
  # A local workerd instance can reload while its first Durable Object is
  # created. Warm up with a fixed, fictional idempotent request. Never retry
  # a real user action or any unknown outcome in this script.
  local warm_ok=0 warm_response=""
  for attempt in $(seq 1 12); do
    warm_response="$(curl --silent --max-time 5 \
      -H 'X-SIGMA-LAB: offline-fixture' \
      -H 'Content-Type: application/json' \
      --data '{"id":"test_warmup0001"}' \
      "http://127.0.0.1:$PORT/offline-lab/issue" || true)"
    if echo "$warm_response" | grep -q '"state":"pending"'; then
      warm_ok=1;break
    fi
    if curl --silent --fail --max-time 3 -H 'X-SIGMA-LAB: offline-fixture' \
      "http://127.0.0.1:$PORT/offline-lab/audit?id=test_warmup0001" \
      | grep -q '"state":"pending"'; then
      warm_ok=1;break
    fi
    sleep 2
  done
  if [ "$warm_ok" -ne 1 ]; then
    echo "Offline Durable Object could not be warmed up safely:"
    tail -n 100 "$LOG"
    exit 1
  fi
  sleep 2
}

echo "Starting isolated Wrangler local runtime; no remote deployment"
start_worker
node tests/cloudflare-offline-lab.mjs before
stop_worker
sleep 2
echo "Restarting Wrangler against exactly the same local durable state"
start_worker
node tests/cloudflare-offline-lab.mjs after
echo "OFFLINE_CLOUDFLARE_DURABLE_RUNTIME_OK"
