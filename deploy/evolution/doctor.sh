#!/usr/bin/env bash
# =============================================================================
# doctor.sh — coleta um diagnóstico da VM da Evolution API para colar no chat.
#
# Não imprime segredos (a API key sai mascarada; a URI do banco não é exibida).
# Uso, na VM:
#   cd /opt/crm-facil-ia/deploy/evolution && sudo bash doctor.sh
#   # ou, depois do bootstrap:
#   cd /opt/evolution && sudo bash /opt/crm-facil-ia/deploy/evolution/doctor.sh
# =============================================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/evolution}"

section() { printf '\n===== %s =====\n' "$*"; }

section "host"
hostname
uptime
date
if [ -r /etc/os-release ]; then . /etc/os-release; echo "${PRETTY_NAME:-}"; fi

section "memoria"
free -h
echo
swapon --show 2>/dev/null || echo "sem swap ativo"

section "disco"
df -h / 2>/dev/null
[ -d /var/lib/docker ] && df -h /var/lib/docker 2>/dev/null

section "docker"
docker --version 2>&1
docker compose version 2>&1

if [ ! -d "$APP_DIR" ]; then
  echo "Pasta $APP_DIR não existe (bootstrap ainda não rodou?)."
  exit 0
fi
cd "$APP_DIR" || exit 0

section "containers"
docker compose ps 2>&1

section "imagens"
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' 2>&1 | head -10

section "evolution (loopback, dentro do container)"
docker compose exec -T evolution-api node -e \
  "fetch('http://127.0.0.1:8080/').then(r=>r.text().then(t=>console.log('HTTP',r.status,String(t).slice(0,400)))).catch(e=>console.log('erro:',e.message))" 2>&1

section "https publico"
DOMAIN_FROM_ENV="$(grep -E '^SERVER_URL=' .env 2>/dev/null | cut -d= -f2- | sed 's|https://||; s|/$||')"
if [ -n "${DOMAIN_FROM_ENV:-}" ]; then
  curl -sS -m 15 -o /dev/null \
    -w "dominio=${DOMAIN_FROM_ENV} http=%{http_code} tls_verify=%{ssl_verify_result} tempo=%{time_total}s\n" \
    "https://${DOMAIN_FROM_ENV}/" 2>&1
else
  echo "SERVER_URL não encontrado no .env"
fi

section "env (mascarado)"
grep -E '^(SERVER_URL|DATABASE_PROVIDER|DATABASE_SAVE_DATA_INSTANCE|CACHE_LOCAL_ENABLED|CACHE_REDIS_ENABLED|NODE_OPTIONS|AUTHENTICATION_API_KEY)=' .env 2>/dev/null \
  | sed -E 's/(AUTHENTICATION_API_KEY=).*/\1***MASCARADA***/'

section "logs evolution (80 linhas)"
docker compose logs --tail=80 --no-color evolution-api 2>&1

section "logs caddy (30 linhas)"
docker compose logs --tail=30 --no-color caddy 2>&1

section "logs postgres (30 linhas)"
docker compose logs --tail=30 --no-color postgres 2>&1

section "cron"
ls -l /etc/cron.d/ 2>/dev/null

section "backup"
ls -lh /var/backups/evolution 2>/dev/null | tail -5 || echo "sem backups ainda"
