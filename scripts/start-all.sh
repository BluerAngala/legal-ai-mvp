#!/bin/bash
# Start all services: iii engine + harness bundle + set default approval mode
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# Load env vars
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

export LLM_API_KEY="${LLM_API_KEY:-sk-crwfmfqcogblddlpymiqqaatuepooklkjdelsxephytdswwe}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-$LLM_API_KEY}"
export III_ENGINE_URL="${III_ENGINE_URL:-ws://localhost:49134}"

echo "[start] iii engine..."
nohup iii --config ./config.yaml >> logs/iii-engine.log 2>&1 &
ENGINE_PID=$!
echo "[start] engine PID: $ENGINE_PID"

# Wait for engine to be ready
echo "[start] waiting for engine..."
for i in $(seq 1 20); do
    sleep 1
    if lsof -i :49134 2>/dev/null | grep -q LISTEN; then
        echo "[start] engine ready on port 49134"
        break
    fi
    echo "  attempt $i/20..."
done

echo "[start] starting harness bundle..."
bash "$SCRIPT_DIR/start-harness.sh" >> logs/harness.log 2>&1 &
HARNESS_PID=$!
echo "[start] harness PID: $HARNESS_PID"

# Wait for harness to register
echo "[start] waiting for harness..."
sleep 8

# Set default approval mode to "full" (auto-approve all function calls)
echo "[start] setting approval mode to full..."
iii trigger configuration::set \
  id="harness" \
  value='{"permissions":{"default_mode":"full"},"providers":{}}' \
  2>/dev/null || echo "[start] config set skipped (may already be set)"

echo ""
echo "[start] all services started"
echo "  engine: PID $ENGINE_PID"
echo "  harness: PID $HARNESS_PID"
echo ""
echo "Logs:"
echo "  engine:  tail -f logs/iii-engine.log"
echo "  harness: tail -f logs/harness.log"
echo ""
echo "Test session:"
echo '  iii trigger run::start session_id="test" provider="openai" model="deepseek-ai/DeepSeek-V3" mode="ask" messages='"'"'[{"role":"user","content":[{"type":"text","text":"2+2等于几"}]}]'"'"''
