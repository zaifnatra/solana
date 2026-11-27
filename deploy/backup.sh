#!/bin/sh
# Consistent online SQLite snapshot; does not stop the trading service.
set -eu
. "$(dirname -- "$0")/common.sh"
umask 077
backup_dir=${1:-backups}
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/mtl-$stamp-$$.tgz"
partial="$backup_file.partial"
trap 'rm -f "$partial"' EXIT INT TERM
(
    set -C
    compose exec -T mtl sh -eu -c '
        snapshot_dir=$(mktemp -d /data/.backup-XXXXXXXX)
        trap '\''rm -rf "$snapshot_dir"'\'' EXIT INT TERM
        sqlite3 "$MTL_DATABASE" ".timeout 10000" ".backup $snapshot_dir/snapshot.sqlite3"
        test "$(sqlite3 "$snapshot_dir/snapshot.sqlite3" "PRAGMA integrity_check;")" = ok
        mtl-audit check-db "$snapshot_dir/snapshot.sqlite3" >&2
        tar -C "$snapshot_dir" -czf - snapshot.sqlite3
    ' > "$partial"
)
python3 deploy/verify_backup.py "$partial"
mv "$partial" "$backup_file"
printf 'Verified backup: %s\n' "$backup_file"
