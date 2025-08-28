#!/bin/bash

# ============================================
# Crypto Trading Bot VPS Deployment Script
# ============================================
# This script will automatically deploy the crypto trading bot on a fresh VPS
# Requirements: Ubuntu/Debian server with sudo access

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
GITHUB_REPO="https://github.com/remardo/tg-crypto-signal.git"
PROJECT_DIR="/var/www/tg-crypto-signal"
NODE_VERSION="18"
DB_NAME="tg_crypto_signal"
DB_USER="tg_crypto_user"
REDIS_PORT="6379"

# Functions
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

# Check if sudo is available
if ! command -v sudo &> /dev/null; then
    log_error "sudo is not available. Please install sudo or run as root."
    exit 1
fi

log_info "🚀 Starting Crypto Trading Bot deployment..."

# Step 1: Update system
log_info "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Step 2: Install essential packages
log_info "📦 Installing essential packages..."
sudo apt install -y curl wget git htop ufw build-essential software-properties-common

# Step 3: Install Node.js 18
log_info "📦 Installing Node.js $NODE_VERSION..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    log_warning "Node.js is already installed. Skipping..."
fi

# Step 4: Install PostgreSQL
log_info "📦 Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Step 5: Install Redis
log_info "📦 Installing Redis..."
sudo apt install -y redis-server

# Step 6: Install PM2
log_info "📦 Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    log_warning "PM2 is already installed. Skipping..."
fi

# Step 7: Configure firewall
log_info "🔥 Configuring firewall..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 3000
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force reload

# Step 8: Start and enable services
log_info "🔄 Starting services..."
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Step 9: Setup PostgreSQL database
log_info "🗄️ Setting up PostgreSQL database..."
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || log_warning "Database $DB_NAME already exists"
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD 'secure_password_123';" 2>/dev/null || log_warning "User $DB_USER already exists"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true

# Step 10: Create project directory
log_info "📁 Creating project directory..."
sudo mkdir -p $PROJECT_DIR
sudo chown -R $USER:$USER $PROJECT_DIR

# Step 11: Clone repository
if [ -d "$PROJECT_DIR/.git" ]; then
    log_warning "Repository already exists. Pulling latest changes..."
    cd $PROJECT_DIR
    git pull origin main
else
    log_info "📥 Cloning repository..."
    git clone $GITHUB_REPO $PROJECT_DIR
    cd $PROJECT_DIR
fi

# Step 12: Install Node.js dependencies
log_info "📦 Installing Node.js dependencies..."
npm install

# Step 13: Build frontend
log_info "🔨 Building frontend..."
npm run build

# Step 14: Setup environment file
if [ ! -f ".env" ]; then
    log_info "⚙️ Creating .env file..."
    cp .env.example .env

    # Generate secure passwords
    POSTGRES_PASSWORD=$(openssl rand -base64 32)
    JWT_SECRET=$(openssl rand -base64 32)
    REDIS_PASSWORD=$(openssl rand -base64 32)

    # Update .env with generated values
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://$DB_USER:secure_password_123@localhost:5432/$DB_NAME|" .env
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" .env
    sed -i "s|REDIS_HOST=.*|REDIS_HOST=127.0.0.1|" .env
    sed -i "s|REDIS_PORT=.*|REDIS_PORT=$REDIS_PORT|" .env

    log_warning "⚠️  IMPORTANT: Please edit .env file and add your:"
    log_warning "   - TELEGRAM_BOT_TOKEN"
    log_warning "   - BINGX_API_KEY"
    log_warning "   - BINGX_SECRET_KEY"
    log_warning "   - OPENAI_API_KEY"
else
    log_warning ".env file already exists. Skipping..."
fi

# Step 15: Run database migrations
log_info "🗄️ Running database migrations..."
npm run migrate

# Step 16: Setup PM2
log_info "⚙️ Setting up PM2..."
if [ -f "ecosystem.config.js" ]; then
    pm2 stop tg-crypto-signal 2>/dev/null || true
    pm2 delete tg-crypto-signal 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup
else
    log_error "ecosystem.config.js not found!"
    exit 1
fi

# Step 17: Setup log rotation
log_info "📝 Setting up log rotation..."
sudo tee /etc/logrotate.d/tg-crypto-signal > /dev/null <<EOF
/var/www/tg-crypto-signal/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Step 18: Create backup script
log_info "💾 Creating backup script..."
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/www/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="tg_crypto_backup_$DATE"

mkdir -p $BACKUP_DIR

echo "Creating database backup..."
sudo -u postgres pg_dump tg_crypto_signal > $BACKUP_DIR/$BACKUP_NAME.sql

echo "Creating Redis backup..."
redis-cli BGSAVE

echo "Creating project backup..."
tar -czf $BACKUP_DIR/$BACKUP_NAME.tar.gz -C /var/www tg-crypto-signal

echo "Backup completed: $BACKUP_DIR/$BACKUP_NAME"
EOF

chmod +x backup.sh

# Step 19: Create monitoring script
log_info "📊 Creating monitoring script..."
cat > monitor.sh << 'EOF'
#!/bin/bash
echo "=== System Status ==="
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo ""

echo "=== PM2 Status ==="
pm2 status
echo ""

echo "=== Services Status ==="
sudo systemctl status postgresql --no-pager -l | head -10
echo ""
sudo systemctl status redis-server --no-pager -l | head -10
echo ""

echo "=== Application Health ==="
curl -s http://localhost:3000/health || echo "Health check failed"
echo ""

echo "=== Disk Usage ==="
df -h
echo ""

echo "=== Memory Usage ==="
free -h
EOF

chmod +x monitor.sh

# Step 20: Final checks
log_info "🔍 Running final checks..."

# Check if services are running
if sudo systemctl is-active --quiet postgresql; then
    log_success "✅ PostgreSQL is running"
else
    log_error "❌ PostgreSQL is not running"
fi

if sudo systemctl is-active --quiet redis-server; then
    log_success "✅ Redis is running"
else
    log_error "❌ Redis is not running"
fi

# Check if PM2 process is running
if pm2 describe tg-crypto-signal > /dev/null 2>&1; then
    log_success "✅ Application is running with PM2"
else
    log_error "❌ Application is not running with PM2"
fi

# Check if port 3000 is listening
if ss -tlnp | grep -q ":3000 "; then
    log_success "✅ Port 3000 is listening"
else
    log_error "❌ Port 3000 is not listening"
fi

# Final instructions
log_success "🎉 Deployment completed!"
echo ""
echo "=== Next Steps ==="
echo "1. Edit .env file with your API keys:"
echo "   nano $PROJECT_DIR/.env"
echo ""
echo "2. Configure your Telegram bot token"
echo "3. Add your BingX API credentials"
echo "4. Add your OpenAI API key"
echo ""
echo "5. Restart the application:"
echo "   pm2 restart tg-crypto-signal"
echo ""
echo "6. Check application status:"
echo "   pm2 status"
echo "   pm2 logs tg-crypto-signal"
echo ""
echo "7. Access the application:"
echo "   http://your-server-ip:3000"
echo ""
echo "=== Useful Commands ==="
echo "• View logs: pm2 logs tg-crypto-signal"
echo "• Restart app: pm2 restart tg-crypto-signal"
echo "• Monitor: pm2 monit"
echo "• Backup: ./backup.sh"
echo "• Monitor system: ./monitor.sh"
echo ""
echo "=== Security Recommendations ==="
echo "• Change default PostgreSQL password"
echo "• Setup SSL certificate (Let's Encrypt)"
echo "• Configure nginx reverse proxy"
echo "• Setup firewall rules"
echo "• Enable fail2ban"
echo ""
log_success "Deployment script completed successfully! 🚀"
