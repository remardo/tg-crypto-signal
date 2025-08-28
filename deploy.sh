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

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Copying .env.example to .env..."
    cp .env.example .env
    echo "Please edit .env file with your credentials before starting the app!"
    exit 1
fi

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
