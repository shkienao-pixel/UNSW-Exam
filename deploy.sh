#!/bin/bash
# Exam Master — VPS Deployment Script
# Run as root on Hostinger VPS (Ubuntu 22.04)
# Usage: bash deploy.sh

set -e

DOMAIN="api.exammaster.tech"
EMAIL="your@email.com"       # Change this — used for SSL cert notifications
REPO="https://github.com/shkienao-pixel/UNSW-Exam.git"
APP_DIR="/opt/exammaster"

echo "═══════════════════════════════════════════"
echo " Exam Master — VPS Setup"
echo "═══════════════════════════════════════════"

# ── 1. System packages ────────────────────────────────────────────────────────
echo "▶ Installing Docker + Certbot..."
apt-get update -q
apt-get install -y docker.io docker-compose certbot git curl

# Enable Docker on boot
systemctl enable docker
systemctl start docker

# ── 2. Clone / update repo ───────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "▶ Pulling latest code..."
  cd "$APP_DIR" && git pull
else
  echo "▶ Cloning repo..."
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 3. Check .env ─────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/backend/.env" ]; then
  echo ""
  echo "❌ ERROR: backend/.env not found!"
  echo "   Copy backend/.env.example to backend/.env and fill in your keys:"
  echo "   cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env"
  echo "   nano $APP_DIR/backend/.env"
  exit 1
fi

# ── 4. Get SSL certificate (HTTP challenge — nginx not yet running) ───────────
echo "▶ Obtaining SSL certificate for $DOMAIN..."
certbot certonly --standalone \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  -d "$DOMAIN" || echo "⚠ Certbot failed — certificate may already exist, continuing..."

# Copy certs to Docker volume location
mkdir -p /var/lib/docker/volumes/exammaster_certbot-conf/_data/live/$DOMAIN

# ── 5. Start Docker services ──────────────────────────────────────────────────
echo "▶ Building and starting services..."
cd "$APP_DIR"
docker-compose up -d --build

echo ""
echo "✅ Done!"
echo "   Backend: https://$DOMAIN/health"
echo ""
echo "Next steps:"
echo "  1. Deploy frontend to Vercel (connect GitHub repo)"
echo "  2. Set NEXT_PUBLIC_API_URL=https://$DOMAIN in Vercel env vars"
echo "  3. Add domain exammaster.tech in Vercel → copy DNS record to Hostinger"
echo "  4. Generate invite codes: curl -X POST https://$DOMAIN/admin/invites \\"
echo "       -H 'X-Admin-Secret: YOUR_SECRET' -H 'Content-Type: application/json' \\"
echo "       -d '{\"note\": \"first batch\", \"max_uses\": 10}'"
