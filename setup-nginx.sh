#!/bin/bash

# ============================================
# Nginx Setup Script for Crypto Trading Bot
# ============================================
# This script configures Nginx as a reverse proxy with domain support

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DOMAIN=""
EMAIL=""

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
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root. Use: sudo $0 [domain]"
   exit 1
fi

log_info "🌐 Setting up Nginx reverse proxy for Crypto Trading Bot..."

# Get domain name
if [ -z "$1" ]; then
    read -p "Enter your domain name (leave empty for IP-based setup): " DOMAIN
else
    DOMAIN=$1
fi

# Install Nginx if not installed
log_info "📦 Checking Nginx..."
if ! command -v nginx &> /dev/null; then
    log_info "Installing Nginx..."
    apt update
    apt install -y nginx
    log_success "Nginx installed ✓"
else
    log_success "Nginx already installed ✓"
fi

# Backup existing configuration
log_info "📋 Backing up existing configuration..."
if [ -f "/etc/nginx/sites-available/tg-crypto-signal" ]; then
    cp /etc/nginx/sites-available/tg-crypto-signal /etc/nginx/sites-available/tg-crypto-signal.backup.$(date +%Y%m%d_%H%M%S)
fi

# Create Nginx configuration
log_info "⚙️ Creating Nginx configuration..."

if [ -n "$DOMAIN" ]; then
    # Domain-based configuration with SSL redirect
    cat > /etc/nginx/sites-available/tg-crypto-signal << EOF
# Upstream backend
upstream tg_crypto_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server (SSL will be added by Certbot)
server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL configuration (uncomment after running setup-ssl.sh)
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Proxy to the Node.js application
    location / {
        proxy_pass http://tg_crypto_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;

        # Rate limiting
        limit_req zone=api burst=10 nodelay;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://tg_crypto_app;
    }

    # API endpoints
    location /api/ {
        proxy_pass http://tg_crypto_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://tg_crypto_app;
        access_log off;
    }

    # Security: Don't serve dotfiles
    location ~ /\. {
        deny all;
    }
}

# Rate limiting zone
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
EOF
else
    # IP-based configuration
    cat > /etc/nginx/sites-available/tg-crypto-signal << 'EOF'
# Upstream backend
upstream tg_crypto_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Proxy to the Node.js application
    location / {
        proxy_pass http://tg_crypto_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;

        # Rate limiting
        limit_req zone=api burst=10 nodelay;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://tg_crypto_app;
    }

    # API endpoints
    location /api/ {
        proxy_pass http://tg_crypto_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://tg_crypto_app;
        access_log off;
    }

    # Security: Don't serve dotfiles
    location ~ /\. {
        deny all;
    }
}

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
EOF
fi

# Enable the site
log_info "🔗 Enabling site..."
ln -sf /etc/nginx/sites-available/tg-crypto-signal /etc/nginx/sites-enabled/

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test configuration
log_info "🧪 Testing Nginx configuration..."
if nginx -t; then
    log_success "Nginx configuration is valid ✓"
else
    log_error "Nginx configuration has errors!"
    exit 1
fi

# Restart Nginx
log_info "🔄 Restarting Nginx..."
systemctl restart nginx
systemctl enable nginx

if systemctl is-active --quiet nginx; then
    log_success "Nginx restarted successfully ✓"
else
    log_error "Failed to restart Nginx!"
    exit 1
fi

# Update firewall
log_info "🔥 Updating firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 'Nginx Full'
    log_success "UFW firewall updated ✓"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    log_success "Firewalld updated ✓"
else
    log_warning "No firewall detected, please configure manually"
fi

echo ""
echo "========================================"
echo "✅ Nginx setup completed successfully!"
echo "========================================"

if [ -n "$DOMAIN" ]; then
    echo "Domain: $DOMAIN"
    echo "HTTP:  http://$DOMAIN (redirects to HTTPS)"
    echo "HTTPS: https://$DOMAIN (after SSL setup)"
    echo ""
    echo "=== Next Steps ==="
    echo "1. Point your domain DNS to this server"
    echo "2. Run SSL setup: sudo bash setup-ssl.sh $DOMAIN"
else
    echo "Server IP: $(curl -s ifconfig.me || hostname -I | awk '{print $1}')"
    echo "URL: http://$(curl -s ifconfig.me || hostname -I | awk '{print $1}')"
    echo ""
    echo "=== For Domain Setup ==="
    echo "Run: sudo bash setup-nginx.sh yourdomain.com"
fi

echo ""
echo "=== Configuration Details ==="
echo "• Config file: /etc/nginx/sites-available/tg-crypto-signal"
echo "• Proxying to: localhost:3000"
echo "• Rate limiting: 10 requests/second"
echo "• Gzip compression: Enabled"
echo "• Security headers: Enabled"
echo ""
echo "=== Test Your Setup ==="
echo "• Health check: /health"
echo "• API endpoints: /api/*"
echo ""
echo "=== Useful Commands ==="
echo "• Test config: nginx -t"
echo "• Reload: systemctl reload nginx"
echo "• Restart: systemctl restart nginx"
echo "• View access logs: tail -f /var/log/nginx/access.log"
echo "• View error logs: tail -f /var/log/nginx/error.log"
echo ""
echo "=== Security Features ==="
echo "• Rate limiting enabled"
echo "• Security headers configured"
echo "• Dotfiles protected"
echo "• Gzip compression enabled"
echo "• Static file caching enabled"

log_success "🎉 Nginx setup completed!"
