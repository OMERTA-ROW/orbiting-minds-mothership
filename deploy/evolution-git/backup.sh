#!/bin/sh
# Versioned, independent backup: run daily from host cron. Keeps 14 copies.
set -eu
DEST=${BACKUP_DIR:-/var/backups/evolution-git}; mkdir -p "$DEST"
docker compose exec -T -u git forgejo forgejo dump --type tar.gz -f - > "$DEST/forgejo-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
ls -1t "$DEST"/forgejo-*.tar.gz | tail -n +15 | xargs -r rm --
