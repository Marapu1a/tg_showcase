#!/bin/bash
set -euo pipefail
umask 077
target=/var/backups/tg-showcase
mkdir -p "$target"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
runuser -u postgres -- pg_dump -p 5434 -Fc tg_showcase > "$target/$stamp.dump.tmp"
mv "$target/$stamp.dump.tmp" "$target/$stamp.dump"
tar -czf "$target/$stamp-state.tar.gz" -C /var/lib/tg-showcase .
# Retain two weeks on the server; external backup is configured separately.
find "$target" -maxdepth 1 -type f \( -name '*.dump' -o -name '*-state.tar.gz' \) -mtime +14 -delete
