#!/bin/bash

# ============================================
# Update Script for Crypto Trading Bot
# ============================================
# This script updates the application from GitHub

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="/var/www/tg-crypto-signal"
BACKUP_DIR="/var/backups/tg-crypto-signal"

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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   log_error "This script should not be run as root. Please run as a regular user with sudo access."
   exit 1
fi

log_info "🚀 Starting Crypto Trading Bot Update..."

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Project directory $PROJECT_DIR does not exist."
    exit 1
fi

cd $PROJECT_DIR

# Create backup before update
log_info "📦 Creating backup before update..."
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="pre_update_$TIMESTAMP"

if [ -f "backup.sh" ]; then
    bash backup.sh
else
    log_warning "Backup script not found, skipping backup"
fi

# Check git status
log_info "🔄 Checking git status..."
if ! git status --porcelain > /dev/null 2>&1; then
    log_error "Not a git repository!"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    log_warning "Uncommitted changes detected:"
    git status --short
    echo ""
    read -p "Do you want to stash changes? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git stash
        log_success "Changes stashed ✓"
    else
        log_error "Update cancelled due to uncommitted changes"
        exit 1
    fi
fi

# Fetch latest changes
log_info "📥 Fetching latest changes..."
git fetch origin

# Check if there are updates
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master)

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    log_success "✅ Already up to date!"
    echo "Local commit: $LOCAL_COMMIT"
    echo "Remote commit: $REMOTE_COMMIT"
    exit 0
fi

log_info "Updates available:"
echo "Local:  $LOCAL_COMMIT"
echo "Remote: $REMOTE_COMMIT"
echo ""

# Show changelog
log_info "📋 Recent changes:"
git log --oneline $LOCAL_COMMIT..$REMOTE_COMMIT || true
echo ""

# Pull latest changes
log_info "⬇️ Pulling latest changes..."
git pull origin main 2>/dev/null || git pull origin master

log_success "Code updated ✓"

# Check Node.js dependencies
log_info "📦 Checking dependencies..."
if [ -f "package.json" ]; then
    # Check if package-lock.json exists
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
    log_success "Dependencies updated ✓"
else
    log_warning "package.json not found"
fi

# Run database migrations if needed
log_info "🗄️ Checking database migrations..."
if [ -f "package.json" ] && grep -q "migrate" package.json; then
    if npm run migrate --silent 2>/dev/null; then
        log_success "Database migrations completed ✓"
    else
        log_warning "Database migration failed or not needed"
    fi
fi

# Build frontend if needed
log_info "🔨 Building frontend..."
if [ -f "package.json" ] && grep -q "build" package.json; then
    if npm run build --silent 2>/dev/null; then
        log_success "Frontend built ✓"
    else
        log_warning "Frontend build failed"
    fi
fi

# Restart application
log_info "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 stop tg-crypto-signal 2>/dev/null || true
    pm2 delete tg-crypto-signal 2>/dev/null || true

    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
        pm2 save
        log_success "Application restarted ✓"
    else
        log_error "ecosystem.config.js not found!"
        exit 1
    fi
else
    log_error "PM2 not installed!"
    exit 1
fi

# Wait for application to start
sleep 5

# Health check
log_info "🔍 Running health check..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log_success "✅ Application is healthy!"
else
    log_error "⚠️ Health check failed. Please check logs:"
    echo "pm2 logs tg-crypto-signal"
    exit 1
fi

echo ""
echo "========================================"
echo "✅ Update completed successfully!"
echo "========================================"
echo "Updated from: $LOCAL_COMMIT"
echo "Updated to:   $(git rev-parse HEAD)"
echo ""
echo "=== Application Status ==="
echo "• Status: $(pm2 jlist | jq -r '.[0].pm2_env.status 2>/dev/null || echo "Unknown"')"
echo "• Memory: $(pm2 jlist | jq -r '.[0].monit.memory 2>/dev/null | xargs -I {} echo "scale=2; {}/1024/1024" | bc 2>/dev/null || echo "0") MB"
echo "• URL: http://localhost:3000"
echo ""
echo "=== Useful Commands ==="
echo "• View logs: pm2 logs tg-crypto-signal"
echo "• Monitor: pm2 monit"
echo "• Check status: pm2 status"
echo ""
echo "=== Backup Information ==="
echo "Pre-update backup created in: $BACKUP_DIR"
echo "To rollback if needed:"
echo "  cd $BACKUP_DIR"
echo "  # Find the latest backup and restore manually"

log_success "🎉 Update process completed!"
