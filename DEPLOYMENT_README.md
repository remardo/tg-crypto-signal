# 🚀 Crypto Trading Bot - VPS Deployment Guide

## 📋 Overview

This guide provides automated scripts for deploying the Crypto Trading Bot on a VPS server with production-ready configuration including Nginx, SSL, monitoring, and backup systems.

## 🛠️ Available Scripts

### Core Deployment Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `deploy-vps.sh` | Complete automated VPS deployment | `bash deploy-vps.sh` |
| `quick-start.sh` | Fast application startup check | `bash quick-start.sh` |
| `update.sh` | Update application from GitHub | `bash update.sh` |

### Infrastructure Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `setup-nginx.sh` | Nginx reverse proxy setup | `sudo bash setup-nginx.sh [domain]` |
| `setup-ssl.sh` | Let's Encrypt SSL certificates | `sudo bash setup-ssl.sh domain.com` |

### Maintenance Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `status-check.sh` | System and application status | `bash status-check.sh` |
| `monitor.sh` | Health monitoring with alerts | `bash monitor.sh` |
| `backup.sh` | Database and file backup | `bash backup.sh` |

## 🚀 Quick Start

### 1. Initial Deployment

```bash
# On your VPS server
curl -fsSL https://raw.githubusercontent.com/yourusername/tg-crypto-signal/main/deploy-vps.sh | bash
```

This script will:
- ✅ Update system packages
- ✅ Install Node.js, PostgreSQL, Redis
- ✅ Configure firewall and security
- ✅ Clone and setup the application
- ✅ Configure PM2 process manager
- ✅ Set up basic monitoring

### 2. Configure Domain (Optional)

```bash
# Set up Nginx with domain
sudo bash setup-nginx.sh yourdomain.com

# Set up SSL certificate
sudo bash setup-ssl.sh yourdomain.com
```

### 3. Post-Deployment

```bash
# Check system status
bash status-check.sh

# Start monitoring
bash monitor.sh

# Set up automated backup
bash backup.sh
```

## 📋 Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04+ or Debian 11+
- **RAM**: Minimum 2GB, Recommended 4GB+
- **Disk**: Minimum 20GB free space
- **Network**: Stable internet connection

### Required Access
- ✅ Root or sudo access
- ✅ SSH access to VPS
- ✅ Domain name (optional, for SSL)

### Before Deployment
1. **Update system**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Configure firewall**:
   ```bash
   sudo ufw enable
   sudo ufw allow ssh
   sudo ufw allow 80
   sudo ufw allow 443
   ```

3. **Set up domain DNS** (if using domain):
   - Point A record to your VPS IP
   - Point www CNAME to your domain

## 🔧 Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tg_crypto_signal
DB_USER=your_db_user
DB_PASSWORD=your_secure_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# BingX API
BINGX_API_KEY=your_api_key
BINGX_SECRET_KEY=your_secret_key

# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=your_jwt_secret
```

### PM2 Configuration

The `ecosystem.config.js` is automatically configured:

```javascript
module.exports = {
  apps: [{
    name: 'tg-crypto-signal',
    script: 'src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

## 📊 Monitoring & Maintenance

### Automated Monitoring

Run monitoring script:
```bash
bash monitor.sh
```

Features:
- ✅ System resource monitoring
- ✅ Application health checks
- ✅ Database connectivity
- ✅ SSL certificate expiration
- ✅ Email alerts (configure `ALERT_EMAIL`)

### Backup System

Automated backup:
```bash
bash backup.sh
```

Features:
- ✅ Database dump (PostgreSQL)
- ✅ Application files
- ✅ Configuration files
- ✅ Compressed archives
- ✅ Automatic cleanup (7+ days old)

### Update Process

Update from GitHub:
```bash
bash update.sh
```

Features:
- ✅ Git pull latest changes
- ✅ Dependency updates
- ✅ Database migrations
- ✅ Application restart
- ✅ Backup before update

## 🔒 Security Features

### Firewall Configuration
- ✅ UFW/Firewalld integration
- ✅ Nginx Full profile
- ✅ SSH protection
- ✅ Rate limiting (10 req/sec)

### SSL/TLS Security
- ✅ Let's Encrypt certificates
- ✅ TLS 1.2/1.3 only
- ✅ Strong cipher suites
- ✅ HSTS headers
- ✅ Auto-renewal

### Application Security
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ No dotfile serving
- ✅ Gzip compression
- ✅ Static file caching

## 🐛 Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs tg-crypto-signal

# Check system resources
bash status-check.sh
```

#### Database Connection Failed
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
sudo -u postgres psql -c "SELECT 1;"

# Check .env configuration
cat .env | grep DB_
```

#### Nginx Configuration Issues
```bash
# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx

# Check logs
sudo tail -f /var/log/nginx/error.log
```

#### SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificate
sudo certbot renew

# Test SSL
curl -I https://yourdomain.com
```

### Log Files

| Service | Log Location |
|---------|--------------|
| Application | `~/.pm2/logs/tg-crypto-signal-out.log` |
| Nginx Access | `/var/log/nginx/access.log` |
| Nginx Error | `/var/log/nginx/error.log` |
| PostgreSQL | `/var/log/postgresql/postgresql-*.log` |
| Redis | `/var/log/redis/redis-server.log` |
| System | `/var/log/syslog` |

## 📈 Performance Optimization

### System Tuning
```bash
# Increase file descriptors
echo "fs.file-max = 65536" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Optimize PostgreSQL
sudo -u postgres psql -c "ALTER SYSTEM SET shared_buffers = '256MB';"
sudo systemctl restart postgresql
```

### Application Optimization
- ✅ PM2 clustering (if needed)
- ✅ Redis caching enabled
- ✅ Gzip compression
- ✅ Static file caching
- ✅ Database connection pooling

## 🔄 Automated Tasks

### Cron Jobs Setup

```bash
# Edit crontab
sudo crontab -e

# Add these lines:
# System monitoring every 5 minutes
*/5 * * * * /var/www/tg-crypto-signal/monitor.sh

# Daily backup at 2 AM
0 2 * * * /var/www/tg-crypto-signal/backup.sh

# Log rotation weekly
0 3 * * 0 /usr/sbin/logrotate /etc/logrotate.conf
```

### SSL Auto-Renewal

Already configured in `setup-ssl.sh`:
- ✅ Daily certificate check
- ✅ Automatic renewal
- ✅ Nginx reload after renewal

## 📞 Support

### Quick Diagnostics
```bash
# Run all checks
bash status-check.sh
bash monitor.sh

# Check all services
sudo systemctl status postgresql redis-server nginx
pm2 status
```

### Emergency Commands
```bash
# Restart all services
sudo systemctl restart postgresql redis-server nginx
pm2 restart tg-crypto-signal

# Quick backup
bash backup.sh

# View all logs
pm2 logs
sudo tail -f /var/log/nginx/error.log
```

## 🎯 Production Checklist

- [ ] VPS server provisioned
- [ ] Domain DNS configured
- [ ] Firewall configured
- [ ] SSL certificate installed
- [ ] Application deployed
- [ ] Database configured
- [ ] Monitoring enabled
- [ ] Backup system active
- [ ] Auto-update configured
- [ ] Security hardened

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/pm2-doc-single-page/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/docs/)
- [PostgreSQL Tuning](https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server)
- [Redis Configuration](https://redis.io/topics/config)

---

**🎉 Happy Deploying!**

Your Crypto Trading Bot is now production-ready with automated deployment, monitoring, and maintenance scripts.
