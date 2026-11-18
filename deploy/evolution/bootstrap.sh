#!/usr/bin/env bash
# =============================================================================
# bootstrap.sh — prepara uma VM Ubuntu 24.04 (GCP e2-micro) para a Evolution API
#
# Uso (na VM, dentro de deploy/evolution):
#   sudo DOMAIN=crm-evo-malas.duckdns.org DUCKDNS_TOKEN=xxxxxxxx bash bootstrap.sh
#
# - Idempotente: rodar de novo reaproveita os segredos do .env existente.
# - Não abre a porta 8080: só 22 (SSH), 80 e 443 (Caddy/HTTPS).
# - Gera Postgres local, Evolution API v2.3.7 e Caddy com TLS automático.
# =============================================================================
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/evolution}"
DOMAIN="${DOMAIN:-}"
DUCKDNS_TOKEN="${DUCKDNS_TOKEN:-}"
REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/tiagozanardi/crm-facil-ia/main/deploy/evolution}"
TZ_NAME="${TZ_NAME:-America/Sao_Paulo}"

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[aviso] %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m[erro] %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- validações
[[ "${EUID}" -eq 0 ]] || die "execute com sudo."
[[ -n "$DOMAIN" ]] || die "defina o domínio: sudo DOMAIN=seu-sub.duckdns.org bash bootstrap.sh"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "domínio inválido: $DOMAIN"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-$PWD}")" 2>/dev/null && pwd || echo "$PWD")"

# ---------------------------------------------------------------- 1. pacotes
log "1/9 Pacotes básicos"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl openssl ufw cron git >/dev/null
timedatectl set-timezone "$TZ_NAME" 2>/dev/null || warn "não foi possível ajustar o fuso horário."

# ---------------------------------------------------------------- 2. swap
log "2/9 Memória swap (2 GB)"
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
fi
grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=20' > /etc/sysctl.d/99-evolution-swap.conf
sysctl --system >/dev/null 2>&1 || true

# ---------------------------------------------------------------- 3. docker
log "3/9 Docker + Compose"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1
docker compose version >/dev/null 2>&1 || die "plugin 'docker compose' não disponível."

# ---------------------------------------------------------------- 4. arquivos
log "4/9 Arquivos da stack em $APP_DIR"
mkdir -p "$APP_DIR"
for f in docker-compose.yml Caddyfile.template .env.example; do
  if [ -f "$SCRIPT_DIR/$f" ]; then
    cp "$SCRIPT_DIR/$f" "$APP_DIR/$f"
  else
    curl -fsSL "$REPO_RAW/$f" -o "$APP_DIR/$f" || die "não encontrei $f (nem local, nem em $REPO_RAW)."
  fi
done

# ---------------------------------------------------------------- 5. segredos
log "5/9 Segredos"
ENV_FILE="$APP_DIR/.env"
PG_PASS=""
API_KEY=""
if [ -f "$ENV_FILE" ]; then
  PG_PASS="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENV_FILE" | head -n1)"
  API_KEY="$(sed -n 's/^AUTHENTICATION_API_KEY=//p' "$ENV_FILE" | head -n1)"
  warn "reaproveitando o .env existente (nenhum segredo foi trocado)."
fi
PG_PASS="${PG_PASS:-$(openssl rand -hex 24)}"
API_KEY="${API_KEY:-$(openssl rand -hex 32)}"

umask 077
sed -e "s|__DOMAIN__|$DOMAIN|g" \
    -e "s|__POSTGRES_PASSWORD__|$PG_PASS|g" \
    -e "s|__API_KEY__|$API_KEY|g" \
    "$APP_DIR/.env.example" > "$ENV_FILE"
chmod 600 "$ENV_FILE"
sed -e "s|__DOMAIN__|$DOMAIN|g" "$APP_DIR/Caddyfile.template" > "$APP_DIR/Caddyfile"
chmod 644 "$APP_DIR/Caddyfile"
umask 022

# ---------------------------------------------------------------- 6. firewall
log "6/9 Firewall (22, 80, 443)"
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# ---------------------------------------------------------------- 7. dns
log "7/9 DNS"
if [[ "$DOMAIN" == *.duckdns.org && -n "$DUCKDNS_TOKEN" ]]; then
  SUB="${DOMAIN%.duckdns.org}"
  curl -fsS "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=" -o /dev/null \
    || warn "falha ao atualizar o DuckDNS agora; o cron tentará de novo."
  cat > /etc/cron.d/duckdns <<EOF
*/5 * * * * root curl -fsS "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=" >/dev/null 2>&1
EOF
  chmod 600 /etc/cron.d/duckdns
  systemctl enable --now cron >/dev/null 2>&1 || true
elif [[ "$DOMAIN" == *.duckdns.org ]]; then
  warn "sem DUCKDNS_TOKEN: aponte o subdomínio no site do DuckDNS para $(curl -fsS https://api.ipify.org || echo 'o IP da VM')."
else
  warn "domínio próprio: crie um registro A de $DOMAIN para $(curl -fsS https://api.ipify.org || echo 'o IP da VM') antes de acessar."
fi

# ---------------------------------------------------------------- 8. stack
log "8/9 Baixando imagens e subindo a stack"
cd "$APP_DIR"
docker compose pull --quiet
docker compose up -d

# ---------------------------------------------------------------- 9. espera
log "9/9 Aguardando o HTTPS responder (primeiro boot leva 2-3 min)"
READY=0
for _ in $(seq 1 40); do
  if curl -fsS --max-time 8 "https://${DOMAIN}/" >/dev/null 2>&1; then READY=1; break; fi
  sleep 10
done

# ---------------------------------------------------------------- backup
if [ -f "$SCRIPT_DIR/backup.sh" ]; then
  install -m 755 "$SCRIPT_DIR/backup.sh" /usr/local/bin/evolution-backup
else
  curl -fsSL "$REPO_RAW/backup.sh" -o /usr/local/bin/evolution-backup \
    || die "não foi possível instalar o backup.sh."
  chmod 755 /usr/local/bin/evolution-backup
fi
echo '30 3 * * * root /usr/local/bin/evolution-backup >> /var/log/evolution-backup.log 2>&1' > /etc/cron.d/evolution-backup
chmod 600 /etc/cron.d/evolution-backup

# ---------------------------------------------------------------- resumo
IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '?')"
printf '\n\033[1;36m============================================================\033[0m\n'
printf '\033[1;36m Evolution API — instalação concluída\033[0m\n'
printf '\033[1;36m============================================================\033[0m\n'
printf ' URL........: https://%s\n' "$DOMAIN"
printf ' IP público.: %s\n' "$IP"
printf ' Pasta......: %s\n' "$APP_DIR"
printf ' API key....: %s\n' "$API_KEY"
printf ' (também em %s/.env, permissão 600)\n' "$APP_DIR"
if [ "$READY" -eq 1 ]; then
  printf ' Status.....: \033[1;32mHTTPS respondendo\033[0m\n'
else
  printf ' Status.....: \033[1;33mAINDA NÃO RESPONDEU\033[0m — rode: docker compose logs -f evolution-api\n'
fi
printf '\n Próximos comandos:\n'
printf '   cd %s && docker compose ps\n' "$APP_DIR"
printf '   curl -s -H "apikey: %s" https://%s/instance/fetchInstances\n' "$API_KEY" "$DOMAIN"
printf '\n Backup diário às 03:30 em /var/backups/evolution (retenção de 7 dias).\n'
printf ' Guarde a API key no gerenciador de senhas e no .env do CRM (nunca no Git).\n\n'
