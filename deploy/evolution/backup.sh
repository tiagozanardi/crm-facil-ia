#!/usr/bin/env bash
# Backup diário do banco da Evolution API (instalado pelo bootstrap em /usr/local/bin).
# Roda via /etc/cron.d/evolution-backup às 03:30. Retenção: 7 dias.
set -euo pipefail

DIR=/var/backups/evolution
mkdir -p "$DIR"

docker exec evolution_postgres pg_dump -U evolution -d evolution -Fc > "$DIR/evolution-$(date +%F-%H%M).dump"

# Mantém só os 7 dias mais recentes.
find "$DIR" -type f -name '*.dump' -mtime +7 -delete
