#!/bin/sh
# Boots the exact configured image against a restored copy, with no network exposure.
set -eu
. "$(dirname -- "$0")/common.sh"
if [ "$#" -ne 1 ]; then
    printf '%s\n' 'Usage: deploy/restore-check.sh BACKUP.tgz' >&2
    exit 1
fi
volume="mtl-restore-check-$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
container="$volume"
created=false
cleanup() {
    if [ "$created" = true ]; then
        docker rm -f "$container" >/dev/null 2>&1 || true
        docker volume rm "$volume" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT INT TERM
./deploy/restore-volume.sh "$1" "$volume"
created=true
image=$(service_image)
docker run --detach --name "$container" --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges:true \
    --mount "type=volume,src=$volume,dst=/data" --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --memory 512m --pids-limit 128 "$image" >/dev/null
attempt=0
until docker exec "$container" curl --fail --silent http://127.0.0.1:8080/readyz >/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        docker logs "$container" >&2
        printf '%s\n' 'Restored service did not become ready.' >&2
        exit 1
    fi
    sleep 1
done
docker exec "$container" curl --fail --silent http://127.0.0.1:8080/api/v1/markets >/dev/null
printf '%s\n' 'Restore check passed: archive integrity, accounting invariants, service startup, readiness, market API.'
