#!/bin/bash

# ============================================
# Crypto Trading Bot - VPS Deployment Script
# ============================================
# Simple deployment script that can be copied and run directly on VPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_DIR="/var/www/tg-crypto-signal"
GITHUB_REPO="https://github.com/remardo/tg-crypto-signal.git"

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

echo "🚀 Crypto Trading Bot VPS Deployment"
echo "===================================="

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   log_info "Running as root - proceeding with installation..."
else
   log_warning "Not running as root. You may need to enter sudo password..."
fi

# Update system
log_info "📦 Updating system packages..."
apt update && apt upgrade -y

# Install essential tools
log_info "🔧 Installing essential tools..."
apt install -y curl wget git ufw software-properties-common

# Install Node.js 18
log_info "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version | cut -d'.' -f1 | cut -d'v' -f2)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js version is too old. Please install Node.js 18+"
    exit 1
fi
log_success "Node.js $(node --version) installed ✓"

# Install PostgreSQL
log_info "🗄️ Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib

# Start PostgreSQL service
systemctl start postgresql
systemctl enable postgresql

# Create database and user
log_info "🗄️ Setting up database..."
sudo -u postgres psql -c "CREATE DATABASE IF NOT EXISTS tg_crypto_signal;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER IF NOT EXISTS tg_crypto_user WITH PASSWORD 'secure_password_123';" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE tg_crypto_signal TO tg_crypto_user;" 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER tg_crypto_user CREATEDB;" 2>/dev/null || true

log_success "PostgreSQL configured ✓"

# Install Redis
log_info "🔄 Installing Redis..."
apt install -y redis-server
systemctl start redis-server
systemctl enable redis-server
log_success "Redis installed ✓"

# Install PM2
log_info "⚙️ Installing PM2..."
npm install -g pm2
log_success "PM2 installed ✓"

# Clone project
log_info "📥 Cloning project..."
if [ -d "$PROJECT_DIR" ]; then
    log_warning "Project directory already exists. Pulling latest changes..."
    cd $PROJECT_DIR
    git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || true
else
    git clone $GITHUB_REPO $PROJECT_DIR
    cd $PROJECT_DIR
fi

# Install dependencies
log_info "📦 Installing project dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    log_info "⚙️ Creating .env file..."
    cp .env.example .env 2>/dev/null || touch .env

    # Basic .env configuration
    cat > .env << EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tg_crypto_signal
DB_USER=tg_crypto_user
DB_PASSWORD=secure_password_123

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Application Configuration
NODE_ENV=production
PORT=3000
JWT_SECRET=your_super_secret_jwt_key_here_change_this

# Telegram Bot Configuration (Configure these!)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_API_ID=your_telegram_api_id
TELEGRAM_API_HASH=your_telegram_api_hash

# BingX API Configuration (Configure these!)
BINGX_API_KEY=your_bingx_api_key
BINGX_SECRET_KEY=your_bingx_secret_key

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/tg-crypto-signal/app.log
EOF
    log_success ".env file created ✓"
else
    log_info ".env file already exists"
fi

# Run database migrations
log_info "🗄️ Running database migrations..."
npm run migrate 2>/dev/null || log_warning "Migration script not found or failed"

# Build frontend
log_info "🔨 Building frontend..."
npm run build 2>/dev/null || log_warning "Build script not found or failed"

# Configure firewall
log_info "🔥 Configuring firewall..."
ufw --force enable
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow 3000
log_success "Firewall configured ✓"

# Start application with PM2
log_info "🚀 Starting application..."
pm2 stop tg-crypto-signal 2>/dev/null || true
pm2 delete tg-crypto-signal 2>/dev/null || true

if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
    pm2 save
    log_success "Application started with PM2 ✓"
else
    log_warning "ecosystem.config.js not found. Starting with npm..."
    pm2 start npm --name "tg-crypto-signal" -- start
    pm2 save
fi

# Wait for application to start
sleep 5

# Health check
log_info "🔍 Running health check..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log_success "✅ Application is running and healthy!"
else
    log_warning "⚠️ Health check failed. Application may still be starting..."
fi

# Create log directory
mkdir -p /var/log/tg-crypto-signal
chown -R $USER:$USER /var/log/tg-crypto-signal 2>/dev/null || true

echo ""
echo "========================================"
echo "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "========================================"
echo ""
echo "📍 Application URLs:"
echo "• Local: http://localhost:3000"
echo "• Network: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "🔧 Useful Commands:"
echo "• Check status: pm2 status"
echo "• View logs: pm2 logs tg-crypto-signal"
echo "• Restart app: pm2 restart tg-crypto-signal"
echo "• Stop app: pm2 stop tg-crypto-signal"
echo ""
echo "⚙️ Next Steps:"
echo "1. Edit .env file with your API keys:"
echo "   nano $PROJECT_DIR/.env"
echo "2. Configure domain (optional):"
echo "   sudo bash setup-nginx.sh yourdomain.com"
echo "3. Set up SSL (optional):"
echo "   sudo bash setup-ssl.sh yourdomain.com"
echo ""
echo "📊 Monitoring:"
echo "• System status: bash status-check.sh"
echo "• Health monitoring: bash monitor.sh"
echo "• Create backup: bash backup.sh"
echo ""
echo "🚨 IMPORTANT:"
echo "• Change default database password in .env"
echo "• Configure your Telegram and BingX API keys"
echo "• Set up proper firewall rules for production"
echo ""
log_success "🚀 Deployment completed!"
