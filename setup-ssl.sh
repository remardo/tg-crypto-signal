#!/bin/bash

# ============================================
# SSL Setup Script with Let's Encrypt
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
   log_error "This script must be run as root. Use: sudo $0"
   exit 1
fi

# Check if domain is provided
if [ $# -eq 0 ]; then
    log_error "Usage: $0 <domain-name>"
    log_error "Example: $0 example.com"
    exit 1
fi

DOMAIN=$1
EMAIL="admin@$DOMAIN"

log_info "🔒 Setting up SSL certificate for $DOMAIN..."

# Install Certbot
log_info "📦 Installing Certbot..."
apt update
apt install -y certbot python3-certbot-nginx

# Check if Nginx is configured
if [ ! -f "/etc/nginx/sites-available/tg-crypto-signal" ]; then
    log_error "Nginx configuration not found. Run setup-nginx.sh first."
    exit 1
fi

# Update Nginx configuration for SSL
log_info "⚙️ Updating Nginx configuration for SSL..."
sed -i "s/server_name _;/server_name $DOMAIN www.$DOMAIN;/" /etc/nginx/sites-available/tg-crypto-signal

# Add SSL configuration to Nginx
cat >> /etc/nginx/sites-available/tg-crypto-signal << EOF

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:MozTLS:10m;
    ssl_session_tickets off;

    # Modern configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

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
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;

    # Proxy to the Node.js application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:3000;
    }

    # API endpoints
    location /api/ {
        proxy_pass http://localhost:3000;
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
        proxy_pass http://localhost:3000;
        access_log off;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}
EOF

# Test Nginx configuration
log_info "🧪 Testing Nginx configuration..."
nginx -t

# Reload Nginx
log_info "🔄 Reloading Nginx..."
nginx -s reload

# Obtain SSL certificate
log_info "🔐 Obtaining SSL certificate..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos --non-interactive

# Setup auto-renewal
log_info "⏰ Setting up auto-renewal..."
certbot renew --dry-run

# Create renewal hook
mkdir -p /etc/letsencrypt/renewal-hooks/post
cat > /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh << 'EOF'
#!/bin/bash
nginx -s reload
EOF
chmod +x /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh

# Final test
log_info "🧪 Testing HTTPS connection..."
if curl -s -I https://$DOMAIN/health | grep -q "200 OK"; then
    log_success "✅ HTTPS setup completed successfully!"
else
    log_warning "⚠️  HTTPS test failed. Check your DNS settings."
fi

echo ""
echo "=== SSL Configuration Summary ==="
echo "• Domain: $DOMAIN"
echo "• Certificate location: /etc/letsencrypt/live/$DOMAIN/"
echo "• Auto-renewal: Enabled"
echo ""
echo "=== Test Your SSL Setup ==="
echo "• HTTPS: https://$DOMAIN"
echo "• HTTP redirect: http://$DOMAIN (should redirect to HTTPS)"
echo "• Health check: https://$DOMAIN/health"
echo ""
echo "=== Useful Commands ==="
echo "• Check certificate: certbot certificates"
echo "• Renew certificate: certbot renew"
echo "• Test renewal: certbot renew --dry-run"
echo "• View logs: tail -f /var/log/letsencrypt/letsencrypt.log"
echo ""
echo "=== Security Notes ==="
echo "• SSL certificate will auto-renew before expiration"
echo "• Nginx will automatically reload after renewal"
echo "• Monitor certificate expiration with: certbot certificates"
