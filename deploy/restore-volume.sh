#!/bin/sh
# Restore into a NEW named volume. Never replaces a running installation's data.
set -eu
. "$(dirname -- "$0")/common.sh"
if [ "$#" -ne 2 ]; then
    printf '%s\n' 'Usage: deploy/restore-volume.sh BACKUP.tgz NEW_VOLUME_NAME' >&2
    exit 1
fi
backup_file=$1
volume=$2
case "$volume" in
    ''|*[!a-zA-Z0-9_.-]*) printf '%s\n' 'Invalid volume name' >&2; exit 1 ;;
esac
python3 deploy/verify_backup.py "$backup_file"
image=$(service_image)
if [ -z "$image" ]; then
    printf '%s\n' 'Build/start the local Compose service first, or configure MTL_IMAGE for production.' >&2
    exit 1
fi
if docker volume inspect "$volume" >/dev/null 2>&1; then
    printf '%s\n' 'Refusing to overwrite an existing volume; choose a new name.' >&2
    exit 1
fi
docker volume create "$volume" >/dev/null
if ! docker run --rm -i --network none --user 0:0 --entrypoint sh \
    --mount "type=volume,src=$volume,dst=/data" "$image" -eu -c \
    'tar -xzf - -C /data && mv /data/snapshot.sqlite3 /data/mtl.sqlite3 && chown -R 10001:10001 /data' < "$backup_file"; then
    printf 'Restore failed; new volume %s retained for inspection.\n' "$volume" >&2
    exit 1
fi
printf 'Restored into new volume: %s\n' "$volume"
printf '%s\n' 'Verify before switching production MTL_DATA_VOLUME to this volume.'
