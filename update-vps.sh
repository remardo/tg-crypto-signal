#!/bin/bash

# ============================================
# Crypto Trading Bot VPS Update Script
# ============================================
# This script updates the existing deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="/var/www/tg-crypto-signal"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Project directory $PROJECT_DIR does not exist. Run deploy-vps.sh first."
    exit 1
fi

cd $PROJECT_DIR

log_info "🔄 Starting update process..."

# Step 1: Stop the application
log_info "🛑 Stopping application..."
pm2 stop tg-crypto-signal 2>/dev/null || log_warning "Application was not running"

# Step 2: Backup current .env
log_info "💾 Backing up configuration..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Step 3: Pull latest changes
log_info "📥 Pulling latest changes..."
git pull origin main

# Step 4: Check if package.json changed
if git diff HEAD~1 --name-only | grep -q "package.json"; then
    log_info "📦 Package.json changed. Installing dependencies..."
    npm install
else
    log_info "📦 Dependencies unchanged. Skipping npm install..."
fi

# Step 5: Build frontend
log_info "🔨 Building frontend..."
npm run build

# Step 6: Run database migrations if needed
if git diff HEAD~1 --name-only | grep -q "migrations"; then
    log_info "🗄️ Running database migrations..."
    npm run migrate
fi

# Step 7: Start the application
log_info "🚀 Starting application..."
pm2 start ecosystem.config.js

# Step 8: Health check
log_info "🔍 Running health check..."
sleep 5

if curl -s http://localhost:3000/health > /dev/null; then
    log_success "✅ Application is healthy!"
else
    log_warning "⚠️  Health check failed. Check logs with: pm2 logs tg-crypto-signal"
fi

# Step 9: Save PM2 configuration
pm2 save

log_success "🎉 Update completed successfully!"
echo ""
echo "=== Update Summary ==="
echo "• Latest commit: $(git log --oneline -1)"
echo "• Application status: $(pm2 jlist | jq -r '.[0].pm2_env.status')"
echo "• Memory usage: $(pm2 jlist | jq -r '.[0].monit.memory / 1024 / 1024 | floor')MB"
echo ""
echo "=== Useful Commands ==="
echo "• View logs: pm2 logs tg-crypto-signal"
echo "• Monitor: pm2 monit"
echo "• Restart: pm2 restart tg-crypto-signal"
