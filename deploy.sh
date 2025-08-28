#!/bin/bash

# Quick deployment script for VPS
# Run this after cloning the repository

set -e

echo "🚀 Starting deployment..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build frontend
echo "🔨 Building frontend..."
npm run build

#!/bin/bash

# Enhanced deployment script for VPS with diagnostics
# Run this after cloning the repository

set -e

echo "🚀 Enhanced VPS Deployment Script"
echo "================================="

# Function to check service status
check_service() {
    local service=$1
    if sudo systemctl is-active --quiet $service; then
        echo "✅ $service is running"
        return 0
    else
        echo "❌ $service is not running"
        return 1
    fi
}

# Function to start service
start_service() {
    local service=$1
    echo "Starting $service..."
    sudo systemctl start $service
    sleep 2
    if check_service $service; then
        echo "✅ $service started successfully"
    else
        echo "❌ Failed to start $service"
        return 1
    fi
}

# Pre-deployment checks
echo "🔍 Pre-deployment checks..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Are you in the project directory?"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi
echo "✅ Node.js found: $(node --version)"

# Check required services
echo -e "
🔧 Checking required services..."

# Redis
if ! check_service redis-server; then
    echo "Attempting to start Redis..."
    if ! start_service redis-server; then
        echo "❌ Cannot start Redis. Please check Redis installation."
        echo "Install Redis: sudo apt install redis-server"
        exit 1
    fi
fi

# PostgreSQL
if ! check_service postgresql; then
    echo "Attempting to start PostgreSQL..."
    if ! start_service postgresql; then
        echo "❌ Cannot start PostgreSQL. Please check PostgreSQL installation."
        echo "Install PostgreSQL: sudo apt install postgresql postgresql-contrib"
        exit 1
    fi
fi

# Check Redis connectivity
echo "Testing Redis connectivity..."
if ! redis-cli ping &> /dev/null; then
    echo "❌ Cannot connect to Redis"
    echo "Check Redis configuration and try: redis-cli ping"
    exit 1
fi
echo "✅ Redis responding to ping"

# Stop existing PM2 process
echo -e "
🛑 Stopping existing processes..."
pm2 stop tg-crypto-signal 2>/dev/null || true
pm2 delete tg-crypto-signal 2>/dev/null || true

# Backup existing .env if it exists
if [ -f ".env" ]; then
    echo "📋 Backing up existing .env file..."
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
fi

# Install/update dependencies
echo -e "
📦 Installing dependencies..."
npm install

# Build frontend
echo -e "
🔨 Building frontend..."
npm run build

# Restore .env if backup exists
if ls .env.backup.* &> /dev/null; then
    LATEST_BACKUP=$(ls -t .env.backup.* | head -1)
    if [ ! -f ".env" ]; then
        echo "📋 Restoring .env from backup..."
        cp "$LATEST_BACKUP" .env
        echo "⚠️  Please verify .env configuration is correct for production!"
    fi
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo "Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ .env created from .env.example"
        echo "⚠️  Please edit .env with your production credentials!"
        echo "   nano .env"
    else
        echo "❌ .env.example not found. Please create .env manually."
        exit 1
    fi
fi

# Setup database (optional - requires manual intervention)
echo -e "
💾 Database setup reminder:"
echo "Make sure PostgreSQL database is created:"
echo "  sudo -u postgres createdb tg_crypto_signal"
echo "  sudo -u postgres createuser --interactive --pwprompt tg_crypto_user"
echo ""
echo "Then run migrations if needed:"
echo "  npm run migrate"

# Start with PM2
echo -e "
🚀 Starting application with PM2..."
pm2 start ecosystem.config.js

# Wait a moment for startup
sleep 3

# Check PM2 status
echo -e "
📊 PM2 Status:"
pm2 status

# Test application
echo -e "
🌐 Testing application..."
if curl -s --max-time 10 http://localhost:3000/health > /dev/null; then
    echo "✅ Application is responding on port 3000"
else
    echo "⚠️  Application not responding yet. This might be normal if database is not configured."
    echo "Check logs: pm2 logs tg-crypto-signal"
fi

# Save PM2 configuration
pm2 save

echo -e "
🎉 Deployment completed!"
echo ""
echo "📋 Useful commands:"
echo "  pm2 status                    # Check status"
echo "  pm2 logs tg-crypto-signal     # View logs"
echo "  pm2 restart tg-crypto-signal  # Restart app"
echo "  pm2 stop tg-crypto-signal     # Stop app"
echo "  curl http://localhost:3000/health  # Test health"
echo ""
echo "🌐 Access your application at: http://your-server-ip:3000"
echo ""
echo "📞 For issues:"
echo "  1. Check logs: pm2 logs tg-crypto-signal --lines 50"
echo "  2. Run diagnostics: bash diagnostics.sh"
echo "  3. Check Redis: redis-cli ping"
echo "  4. Check PostgreSQL: sudo systemctl status postgresql"

# Setup database (optional - requires manual intervention)
echo "💾 Database setup:"
echo "Make sure PostgreSQL is running and you've created the database:"
echo "  sudo -u postgres createdb tg_crypto_signal"
echo "  sudo -u postgres createuser --interactive --pwprompt tg_crypto_user"
echo ""
echo "Then run migrations:"
echo "  npm run migrate"
echo ""

# Start with PM2
read -p "Start with PM2? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting with PM2..."
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup
    echo "✅ App started with PM2!"
    echo "Check status: pm2 status"
    echo "View logs: pm2 logs tg-crypto-signal"
else
    echo "To start manually:"
    echo "  npm start"
    echo "Or with PM2:"
    echo "  pm2 start ecosystem.config.js"
fi

echo ""
echo "🎉 Deployment completed!"
echo "App should be running on http://localhost:3000"
