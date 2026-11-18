#!/usr/bin/env bash
# One command to run the engine on a fresh local validator.
#   ./run.sh e2e [scenario flags]   build, start validator, run scenario, stop. Exit code = result.
#   ./run.sh up                     build, start validator, serve the staging UI. Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")"
ENGINE=$(cd ../engine && pwd)
RPC=http://127.0.0.1:8899
STATE=$ENGINE/.anchor
mode=${1:-}; shift || true
[[ $mode == e2e || $mode == up ]] || { sed -n '2,4p' "$0"; exit 2; }

for tool in anchor solana-test-validator; do
    command -v "$tool" >/dev/null || { echo "Missing $tool. Install: https://solana.com/docs/intro/installation"; exit 2; }
done
healthy() { curl -s "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q '"ok"'; }
healthy && { echo "A validator already runs on $RPC. Stop it first."; exit 2; }
[[ -d node_modules ]] || npm install --no-audit --no-fund

echo "› anchor build"
(cd "$ENGINE" && anchor build)

# Load the program at its declare_id address. No program keypair or `anchor keys sync` needed.
program_id=$(grep -oE 'declare_id!\("[^"]+"\)' "$ENGINE/programs/sol_proj/src/lib.rs" | cut -d'"' -f2)
mkdir -p "$STATE"
echo "› validator ($program_id), log: $STATE/validator.log"
solana-test-validator --reset --quiet --ledger "$STATE/staging-ledger" \
    --bpf-program "$program_id" "$ENGINE/target/deploy/sol_proj.so" >"$STATE/validator.log" 2>&1 &
validator=$!
trap 'kill $validator 2>/dev/null; wait $validator 2>/dev/null || true' EXIT

for _ in $(seq 60); do healthy && break; kill -0 $validator 2>/dev/null || { cat "$STATE/validator.log"; exit 1; }; sleep 0.5; done
healthy || { echo "Validator did not start in 30 s"; exit 1; }

if [[ $mode == e2e ]]; then
    node scenario.js "$@"
else
    npx vite
fi
