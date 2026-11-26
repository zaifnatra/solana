#!/bin/sh
# Shared by deployment scripts; paths are relative to the checkout root.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"
: "${MTL_COMPOSE_FILE:=compose.yaml}"
compose() {
    if [ -n "${MTL_ENV_FILE:-}" ]; then
        docker compose --env-file "$MTL_ENV_FILE" -f "$MTL_COMPOSE_FILE" "$@"
    else
        docker compose -f "$MTL_COMPOSE_FILE" "$@"
    fi
}
service_image() {
    configured=$(compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["mtl"].get("image", ""))')
    if [ -n "$configured" ]; then
        printf '%s\n' "$configured"
    else
        compose images -q mtl | head -n 1
    fi
}
