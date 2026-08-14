#!/usr/bin/env bash
# setup.sh — Install ark3-capture service on Raspberry Pi OS (Bookworm)
# Run as root: sudo bash setup.sh
# This script does NOT embed or read credentials.
set -euo pipefail

SERVICE_USER="ark3"
INSTALL_PREFIX="/usr/local"
CONFIG_DIR="/etc/ark3"
QUEUE_DIR="/var/lib/ark3/queue"
RUN_DIR="/var/run/ark3"
TOKEN_FILE="/etc/ark3/device-token"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Root check ───────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root: sudo bash $0"
    exit 1
fi

# ── System dependencies ──────────────────────────────────────────────────────
info "Updating apt and installing system dependencies..."
apt-get update -qq
apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    python3-picamera2 python3-libcamera \
    python3-gpiozero \
    python3-yaml

# ── Service user ─────────────────────────────────────────────────────────────
info "Creating service user: ${SERVICE_USER}"
if ! id "${SERVICE_USER}" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin \
        --groups gpio,video "${SERVICE_USER}"
else
    warn "User ${SERVICE_USER} already exists — skipping creation"
fi

# ── Directories ──────────────────────────────────────────────────────────────
info "Creating directories..."
mkdir -p "${CONFIG_DIR}" "${QUEUE_DIR}" "${RUN_DIR}"
chmod 750 "${CONFIG_DIR}"
chmod 750 "${QUEUE_DIR}"
chmod 755 "${RUN_DIR}"
chown "${SERVICE_USER}:${SERVICE_USER}" "${QUEUE_DIR}" "${RUN_DIR}"

# ── Python package ───────────────────────────────────────────────────────────
info "Installing Python package..."
python3 -m pip install --quiet --break-system-packages \
    --requirement "${SCRIPT_DIR}/requirements.txt" \
    "${SCRIPT_DIR}"

# ── Example config ───────────────────────────────────────────────────────────
if [[ ! -f "${CONFIG_DIR}/config.yaml" ]]; then
    info "Installing example config to ${CONFIG_DIR}/config.yaml"
    cp "${SCRIPT_DIR}/config.example.yaml" "${CONFIG_DIR}/config.yaml"
    chown root:root "${CONFIG_DIR}/config.yaml"
    chmod 644 "${CONFIG_DIR}/config.yaml"
    warn "IMPORTANT: Edit ${CONFIG_DIR}/config.yaml and set backend_url and device_name."
else
    info "Config already exists at ${CONFIG_DIR}/config.yaml — skipping"
fi

# ── Token placeholder ────────────────────────────────────────────────────────
if [[ ! -f "${TOKEN_FILE}" ]]; then
    info "Creating token file placeholder at ${TOKEN_FILE}"
    touch "${TOKEN_FILE}"
    chown "${SERVICE_USER}:${SERVICE_USER}" "${TOKEN_FILE}"
    chmod 0600 "${TOKEN_FILE}"
    warn "=========================================================="
    warn "ACTION REQUIRED: Place device token in ${TOKEN_FILE}"
    warn "  The token is a single line, no trailing newline."
    warn "  Obtain it from your backend operator."
    warn "  After placing the token, run:"
    warn "    sudo chmod 0600 ${TOKEN_FILE}"
    warn "    sudo chown ${SERVICE_USER}:${SERVICE_USER} ${TOKEN_FILE}"
    warn "=========================================================="
else
    info "Token file already exists at ${TOKEN_FILE} — skipping"
fi

# ── Systemd service ──────────────────────────────────────────────────────────
info "Installing systemd service..."
cp "${SCRIPT_DIR}/systemd/ark3-capture.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable ark3-capture.service
info "Service enabled. Start with: sudo systemctl start ark3-capture"

info ""
info "Setup complete. Checklist before starting:"
info "  1. Edit /etc/ark3/config.yaml — set backend_url and device_name"
info "  2. Place device bearer token in /etc/ark3/device-token (mode 0600)"
info "  3. sudo systemctl start ark3-capture"
info "  4. sudo journalctl -u ark3-capture -f   (watch logs)"
