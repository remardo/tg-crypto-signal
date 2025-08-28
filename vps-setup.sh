#!/bin/bash

# VPS Setup Script for Crypto Trading Bot
# Run with: curl -fsSL https://raw.githubusercontent.com/your-repo/main/vps-setup.sh | bash

set -e

echo "🚀 Starting VPS setup for Crypto Trading Bot..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
echo "📦 Installing Node.js 18+..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL and Redis
echo "📦 Installing PostgreSQL and Redis..."
sudo apt install -y postgresql postgresql-contrib redis-server
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install build tools
echo "📦 Installing build tools..."
sudo apt-get install -y build-essential

echo "✅ VPS setup completed!"
echo ""
echo "Next steps:"
echo "1. Clone your repository: git clone <your-repo-url>"
echo "2. cd tg_crypto_signal"
echo "3. npm install"
echo "4. npm run build"
echo "5. cp .env.example .env"
echo "6. Edit .env with your credentials"
echo "7. Setup database and start the app"
echo ""
echo "For detailed instructions, see README.md"
