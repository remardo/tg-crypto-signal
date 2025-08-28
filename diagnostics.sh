#!/bin/bash

# VPS Diagnostics Script for Crypto Trading Bot
# Run this to check system status and diagnose issues

echo "🔍 VPS Diagnostics for Crypto Trading Bot"
echo "========================================"

# Check system info
echo -e "\n📊 System Information:"
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Uptime: $(uptime -p)"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"

# Check Node.js
echo -e "\n📦 Node.js Status:"
if command -v node &> /dev/null; then
    echo "✅ Node.js installed: $(node --version)"
else
    echo "❌ Node.js not found"
fi

if command -v npm &> /dev/null; then
    echo "✅ NPM installed: $(npm --version)"
else
    echo "❌ NPM not found"
fi

# Check PM2
echo -e "\n🚀 PM2 Status:"
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 installed"
    echo "PM2 processes:"
    pm2 list --no-color 2>/dev/null || echo "No PM2 processes found"
else
    echo "❌ PM2 not found"
fi

# Check Redis
echo -e "\n💾 Redis Status:"
if command -v redis-server &> /dev/null; then
    echo "✅ Redis server installed"
    if sudo systemctl is-active --quiet redis-server; then
        echo "✅ Redis service is running"
        if redis-cli ping &> /dev/null; then
            echo "✅ Redis responding to ping"
            echo "Redis memory: $(redis-cli info memory | grep used_memory_human | cut -d: -f2)"
        else
            echo "❌ Redis not responding to ping"
        fi
    else
        echo "❌ Redis service is not running"
        echo "Start with: sudo systemctl start redis-server"
    fi
else
    echo "❌ Redis server not installed"
fi

# Check PostgreSQL
echo -e "\n🗄️ PostgreSQL Status:"
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL client installed"
    if sudo systemctl is-active --quiet postgresql; then
        echo "✅ PostgreSQL service is running"
    else
        echo "❌ PostgreSQL service is not running"
        echo "Start with: sudo systemctl start postgresql"
    fi
else
    echo "❌ PostgreSQL client not found"
fi

# Check application
echo -e "\n🌐 Application Status:"
if [ -d "/var/www/tg-crypto-signal" ]; then
    echo "✅ Application directory exists"
    cd /var/www/tg-crypto-signal

    if [ -f "package.json" ]; then
        echo "✅ package.json found"
    else
        echo "❌ package.json not found"
    fi

    if [ -f ".env" ]; then
        echo "✅ .env file exists"
    else
        echo "❌ .env file not found"
    fi

    if [ -d "node_modules" ]; then
        echo "✅ node_modules directory exists"
    else
        echo "❌ node_modules directory not found"
    fi

    if [ -f "dist/bundle.js" ]; then
        echo "✅ Frontend bundle exists"
    else
        echo "❌ Frontend bundle not found"
        echo "Build with: npm run build"
    fi
else
    echo "❌ Application directory not found"
fi

# Check ports
echo -e "\n🔌 Port Status:"
echo "Port 3000 (App): $(sudo ss -tlnp | grep :3000 | wc -l) services listening"
echo "Port 6379 (Redis): $(sudo ss -tlnp | grep :6379 | wc -l) services listening"
echo "Port 5432 (PostgreSQL): $(sudo ss -tlnp | grep :5432 | wc -l) services listening"

# Check connectivity
echo -e "\n🌍 Connectivity Test:"
if curl -s --max-time 5 http://localhost:3000/health > /dev/null; then
    echo "✅ Application responding on port 3000"
else
    echo "❌ Application not responding on port 3000"
fi

# Recent logs
echo -e "\n📝 Recent Application Logs:"
if [ -d "/var/www/tg-crypto-signal/logs" ]; then
    if [ -f "/var/www/tg-crypto-signal/logs/combined.log" ]; then
        echo "Last 5 lines from combined.log:"
        tail -5 /var/www/tg-crypto-signal/logs/combined.log
    else
        echo "No combined.log found"
    fi
else
    echo "Logs directory not found"
fi

echo -e "\n🎯 Quick Fix Commands:"
echo "sudo systemctl start redis-server    # Start Redis"
echo "sudo systemctl start postgresql      # Start PostgreSQL"
echo "cd /var/www/tg-crypto-signal && npm run build    # Build frontend"
echo "pm2 restart tg-crypto-signal         # Restart app"
echo ""
echo "Run diagnostics again after fixes: bash $0"
