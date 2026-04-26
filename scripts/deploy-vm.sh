#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:?APP_DIR is required}"
REPO_URL="${REPO_URL:?REPO_URL is required}"
DEPLOY_REF="${DEPLOY_REF:?DEPLOY_REF is required}"
APP_NAME="${APP_NAME:-rag-backend}"
PORT="${PORT:-5000}"
PRIVATE_IP="${PRIVATE_IP:-}"
BACKEND_ENV_B64="${BACKEND_ENV_B64:-}"
SYNC_MODE="${SYNC_MODE:-git}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"

  for attempt in $(seq 1 30); do
    if curl -fsS "$url" >/dev/null; then
      echo "Health check passed for $label: $url"
      return 0
    fi
    sleep 2
  done

  echo "Health check failed for $label: $url"
  return 1
}

prepare_repo() {
  mkdir -p "$APP_DIR"

  if [[ "$SYNC_MODE" == "git" ]]; then
    mkdir -p "$(dirname "$APP_DIR")"

    if [[ ! -d "$APP_DIR/.git" ]]; then
      git clone "$REPO_URL" "$APP_DIR"
    fi

    cd "$APP_DIR"
    git fetch --all --prune
    git checkout --force "$DEPLOY_REF"
  else
    cd "$APP_DIR"
  fi

  if [[ -n "$BACKEND_ENV_B64" ]]; then
    mkdir -p "$APP_DIR/backend"
    printf '%s' "$BACKEND_ENV_B64" | base64 -d > "$APP_DIR/backend/.env"
    chmod 600 "$APP_DIR/backend/.env"
  fi
}

deploy_with_pm2() {
  cd "$APP_DIR/backend"
  npm ci --omit=dev
  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save

  wait_for_http "http://127.0.0.1:${PORT}/health" "pm2 localhost"

  if [[ -n "$PRIVATE_IP" ]]; then
    wait_for_http "http://${PRIVATE_IP}:${PORT}/health" "pm2 private ip"
  fi
}

require_command npm
require_command pm2
require_command curl
require_command base64

if [[ "$SYNC_MODE" == "git" ]]; then
  require_command git
fi

prepare_repo
deploy_with_pm2
