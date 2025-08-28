#!/bin/bash

# ============================================
# Quick Start Script for Crypto Trading Bot
# ============================================
# This script checks all dependencies and starts the application

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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   log_error "This script should not be run as root. Please run as a regular user with sudo access."
   exit 1
fi

log_info "🚀 Starting Crypto Trading Bot Quick Start..."

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Project directory $PROJECT_DIR does not exist."
    log_info "Please run the deployment script first:"
    log_info "curl -fsSL https://raw.githubusercontent.com/remardo/tg-crypto-signal/main/deploy-vps.sh | bash"
    exit 1
fi

cd $PROJECT_DIR

# Check Node.js
log_info "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed!"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'.' -f1 | cut -d'v' -f2)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js version 18+ is required. Current: $(node --version)"
    exit 1
fi
log_success "Node.js $(node --version) ✓"

# Check npm
log_info "📦 Checking npm..."
if ! command -v npm &> /dev/null; then
    log_error "npm is not installed!"
    exit 1
fi
log_success "npm $(npm --version) ✓"

# Check PostgreSQL
log_info "🗄️ Checking PostgreSQL..."
if ! sudo systemctl is-active --quiet postgresql; then
    log_warning "PostgreSQL is not running. Starting..."
    sudo systemctl start postgresql
fi
log_success "PostgreSQL ✓"

# Check Redis
log_info "🔄 Checking Redis..."
if ! sudo systemctl is-active --quiet redis-server; then
    log_warning "Redis is not running. Starting..."
    sudo systemctl start redis-server
fi
log_success "Redis ✓"

# Check PM2
log_info "⚙️ Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    log_error "PM2 is not installed!"
    exit 1
fi
log_success "PM2 ✓"

# Check .env file
log_info "⚙️ Checking .env file..."
if [ ! -f ".env" ]; then
    log_error ".env file not found!"
    log_info "Please create .env file:"
    log_info "cp .env.example .env"
    log_info "nano .env"
    exit 1
fi
log_success ".env file ✓"

# Check if node_modules exists
log_info "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    log_info "Installing dependencies..."
    npm install
fi
log_success "Dependencies ✓"

# Check if dist directory exists
log_info "🔨 Checking build..."
if [ ! -f "dist/bundle.js" ]; then
    log_info "Building frontend..."
    npm run build
fi
log_success "Build ✓"

# Check database connection
log_info "🗄️ Checking database connection..."
if npm run migrate --silent 2>/dev/null; then
    log_success "Database ✓"
else
    log_warning "Database migration failed. Please check your .env configuration."
fi

# Start the application
log_info "🚀 Starting application..."
pm2 stop tg-crypto-signal 2>/dev/null || true
pm2 delete tg-crypto-signal 2>/dev/null || true

if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
    pm2 save
else
    log_error "ecosystem.config.js not found!"
    exit 1
fi

# Wait a moment for the app to start
sleep 3

# Health check
log_info "🔍 Running health check..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log_success "✅ Application is running and healthy!"
    echo ""
    echo "=== Application Status ==="
    echo "• URL: http://localhost:3000"
    echo "• Health: http://localhost:3000/health"
    echo "• PM2 Status: $(pm2 jlist | jq -r '.[0].pm2_env.status 2>/dev/null || echo "Unknown"')"
    echo ""
    echo "=== Useful Commands ==="
    echo "• View logs: pm2 logs tg-crypto-signal"
    echo "• Monitor: pm2 monit"
    echo "• Restart: pm2 restart tg-crypto-signal"
    echo "• Stop: pm2 stop tg-crypto-signal"
else
    log_warning "⚠️  Health check failed. Application may still be starting..."
    echo ""
    echo "=== Troubleshooting ==="
    echo "• Check logs: pm2 logs tg-crypto-signal"
    echo "• Check PM2 status: pm2 status"
    echo "• Check services: sudo systemctl status postgresql redis-server"
    echo "• Check .env configuration"
fi

log_success "🎉 Quick start completed!"
echo ""
echo "If you need to configure Nginx or SSL, run:"
echo "• Nginx: sudo bash setup-nginx.sh"
echo "• SSL: sudo bash setup-ssl.sh yourdomain.com"
