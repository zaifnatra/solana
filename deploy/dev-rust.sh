#!/bin/sh
# Polling works for bind mounts on Linux and Docker Desktop without an extra watcher.
set -eu
app_pid=''
stop_app() {
    if [ -n "$app_pid" ]; then
        kill -TERM "$app_pid" 2>/dev/null || true
        wait "$app_pid" 2>/dev/null || true
        app_pid=''
    fi
}
trap 'stop_app; exit 0' INT TERM
fingerprint() {
    find service/src service/migrations -type f -exec cksum {} \; | sort
    cksum service/Cargo.toml service/Cargo.lock engine/programs/sol_proj/src/curve.rs
}
previous=''
while :; do
    current=$(fingerprint)
    if [ "$current" != "$previous" ]; then
        previous=$current
        stop_app
        if cargo build --locked --manifest-path service/Cargo.toml; then
            "$CARGO_TARGET_DIR/debug/mtl-service" &
            app_pid=$!
        else
            printf '%s\n' 'Build failed; waiting for a source change.' >&2
        fi
    fi
    sleep 1 &
    wait "$!" || true
done
