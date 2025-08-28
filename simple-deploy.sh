#!/bin/bash

# ============================================
# Simple Deployment Script Downloader
# ============================================
# This script downloads and runs the deployment package

set -e

echo "🚀 Crypto Trading Bot - Simple Deployment"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create temporary directory
TEMP_DIR="/tmp/tg-crypto-deployment"
mkdir -p $TEMP_DIR
cd $TEMP_DIR

echo -e "${BLUE}[INFO]${NC} Downloading deployment package..."

# For now, we'll provide manual download instructions
# In a real scenario, you would host this file somewhere accessible

cat << 'EOF'
📦 ПОСКОЛЬКУ ФАЙЛЫ НЕДОСТУПНЫ С GITHUB, ВОТ ПРОСТОЙ СПОСОБ:

1. СКАЧАЙТЕ ФАЙЛЫ ЛОКАЛЬНО:
   На вашем компьютере создайте архив с файлами:
   tar -czf deployment.tar.gz deploy-vps.sh quick-start.sh setup-nginx.sh setup-ssl.sh status-check.sh monitor.sh backup.sh update.sh

2. ЗАГРУЗИТЕ НА СЕРВЕР:
   scp deployment.tar.gz root@ваш-vps-ip:/tmp/

3. РАСПАКУЙТЕ И ЗАПУСТИТЕ:
   ssh root@ваш-vps-ip
   cd /tmp
   tar -xzf deployment.tar.gz
   chmod +x *.sh
   ./deploy-vps.sh

ИЛИ ИСПОЛЬЗУЙТЕ РУЧНУЮ УСТАНОВКУ НИЖЕ:
EOF

echo ""
echo "📋 РУЧНАЯ УСТАНОВКА:"
echo "===================="

echo ""
echo "1. ОБНОВИТЕ СИСТЕМУ:"
echo "sudo apt update && sudo apt upgrade -y"

echo ""
echo "2. УСТАНОВИТЕ NODE.JS:"
echo "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
echo "sudo apt-get install -y nodejs"

echo ""
echo "3. УСТАНОВИТЕ POSTGRESQL:"
echo "sudo apt install -y postgresql postgresql-contrib"
echo "sudo systemctl start postgresql"
echo "sudo systemctl enable postgresql"

echo ""
echo "4. УСТАНОВИТЕ REDIS:"
echo "sudo apt install -y redis-server"
echo "sudo systemctl start redis-server"
echo "sudo systemctl enable redis-server"

echo ""
echo "5. СКАЧАЙТЕ ПРОЕКТ:"
echo "git clone https://github.com/remardo/tg-crypto-signal.git /var/www/tg-crypto-signal"
echo "cd /var/www/tg-crypto-signal"
echo "npm install"

echo ""
echo "6. НАСТРОЙТЕ БАЗУ ДАННЫХ:"
echo "sudo -u postgres psql"
echo "CREATE DATABASE tg_crypto_signal;"
echo "CREATE USER tg_crypto_user WITH PASSWORD 'your_password';"
echo "GRANT ALL PRIVILEGES ON DATABASE tg_crypto_signal TO tg_crypto_user;"
echo "\\q"

echo ""
echo "7. СОЗДАЙТЕ .ENV ФАЙЛ:"
echo "cp .env.example .env"
echo "nano .env  # Отредактируйте настройки"

echo ""
echo "8. ЗАПУСТИТЕ МИГРАЦИИ:"
echo "npm run migrate"

echo ""
echo "9. ЗАПУСТИТЕ ПРИЛОЖЕНИЕ:"
echo "sudo npm install -g pm2"
echo "pm2 start ecosystem.config.js"
echo "pm2 save"

echo ""
echo -e "${GREEN}✅ ГОТОВО!${NC}"
echo ""
echo "Ваше приложение будет доступно по адресу:"
echo "http://ваш-vps-ip:3000"
echo ""
echo "Для проверки статуса:"
echo "pm2 status"
echo "pm2 logs tg-crypto-signal"
