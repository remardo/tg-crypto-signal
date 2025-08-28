#!/bin/bash

# ============================================
# Monitoring Script for Crypto Trading Bot
# ============================================
# This script monitors system health and application status

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

LOG_FILE="/var/log/tg-crypto-signal/monitor.log"
ALERT_EMAIL=""  # Set your email for alerts

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1" >> $LOG_FILE
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] $1" >> $LOG_FILE
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] $1" >> $LOG_FILE
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $1" >> $LOG_FILE
}

send_alert() {
    local message="$1"
    local subject="Crypto Trading Bot Alert"

    if [ -n "$ALERT_EMAIL" ]; then
        echo "$message" | mail -s "$subject" $ALERT_EMAIL 2>/dev/null || true
    fi

    # Also log to system journal
    logger -t "tg-crypto-signal" "$message"
}

# Create log directory if it doesn't exist
sudo mkdir -p /var/log/tg-crypto-signal
sudo chown $USER:$USER /var/log/tg-crypto-signal

echo "========================================"
echo "🔍 Crypto Trading Bot - Health Monitor"
echo "========================================"

# Check system resources
log_info "Checking system resources..."

CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

echo "CPU Usage: $CPU_USAGE%"
echo "Memory Usage: $MEMORY_USAGE%"
echo "Disk Usage: $DISK_USAGE%"

# Alert thresholds
if (( $(echo "$CPU_USAGE > 90" | bc -l) )); then
    log_error "High CPU usage: $CPU_USAGE%"
    send_alert "High CPU usage detected: $CPU_USAGE%"
fi

if (( $(echo "$MEMORY_USAGE > 90" | bc -l) )); then
    log_error "High memory usage: $MEMORY_USAGE%"
    send_alert "High memory usage detected: $MEMORY_USAGE%"
fi

if [ "$DISK_USAGE" -gt 90 ]; then
    log_error "High disk usage: $DISK_USAGE%"
    send_alert "High disk usage detected: $DISK_USAGE%"
fi

echo ""

# Check services
log_info "Checking services..."

SERVICES_OK=0
SERVICES_TOTAL=0

# PostgreSQL
SERVICES_TOTAL=$((SERVICES_TOTAL + 1))
if sudo systemctl is-active --quiet postgresql; then
    log_success "PostgreSQL: Running ✓"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    log_error "PostgreSQL: Stopped ✗"
    send_alert "PostgreSQL service is stopped"
fi

# Redis
SERVICES_TOTAL=$((SERVICES_TOTAL + 1))
if sudo systemctl is-active --quiet redis-server; then
    log_success "Redis: Running ✓"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    log_error "Redis: Stopped ✗"
    send_alert "Redis service is stopped"
fi

# Nginx (if configured)
if sudo systemctl is-active --quiet nginx; then
    log_success "Nginx: Running ✓"
else
    log_warning "Nginx: Not configured or stopped"
fi

echo ""

# Check application
log_info "Checking application..."

# PM2
if command -v pm2 &> /dev/null; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.status 2>/dev/null || echo "stopped"')
    PM2_MEMORY=$(pm2 jlist 2>/dev/null | jq -r '.[0].monit.memory 2>/dev/null | xargs -I {} echo "scale=2; {}/1024/1024" | bc 2>/dev/null || echo "0"')
    PM2_UPTIME=$(pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.pm_uptime 2>/dev/null || echo "0"')

    if [ "$PM2_STATUS" = "online" ]; then
        log_success "PM2 Application: Running ✓"
        echo "  Status: $PM2_STATUS"
        echo "  Memory: $PM2_MEMORY MB"
        echo "  Uptime: $(date -d @$PM2_UPTIME +"%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown")"

        # Check memory usage
        if (( $(echo "$PM2_MEMORY > 500" | bc -l) )); then
            log_warning "High application memory usage: $PM2_MEMORY MB"
        fi
    else
        log_error "PM2 Application: Stopped ✗"
        send_alert "Application is not running (PM2 status: $PM2_STATUS)"
    fi
else
    log_error "PM2: Not installed ✗"
    send_alert "PM2 is not installed"
fi

echo ""

# Check health endpoint
log_info "Checking health endpoint..."
HEALTH_CHECK=$(curl -s -w "%{http_code}" http://localhost:3000/health 2>/dev/null)
HTTP_CODE=${HEALTH_CHECK: -3}
RESPONSE_BODY=$(curl -s http://localhost:3000/health 2>/dev/null)

if [ "$HTTP_CODE" = "200" ]; then
    log_success "Health Check: OK ✓"
    echo "  HTTP Code: $HTTP_CODE"
    echo "  Response: $(echo $RESPONSE_BODY | jq -r '.status // "OK"' 2>/dev/null || echo "OK")"
else
    log_error "Health Check: Failed ✗"
    echo "  HTTP Code: $HTTP_CODE"
    send_alert "Health check failed with HTTP code: $HTTP_CODE"
fi

echo ""

# Check database connection
log_info "Checking database connection..."
if command -v psql &> /dev/null; then
    if sudo -u postgres psql -c "SELECT 1;" -q 2>/dev/null; then
        log_success "Database Connection: OK ✓"
    else
        log_error "Database Connection: Failed ✗"
        send_alert "Database connection failed"
    fi
else
    log_warning "PostgreSQL client: Not available"
fi

echo ""

# Check recent errors in logs
log_info "Checking recent errors..."
if command -v pm2 &> /dev/null; then
    ERROR_COUNT=$(pm2 logs tg-crypto-signal --lines 100 --nostream 2>/dev/null | grep -i error | wc -l)
    if [ "$ERROR_COUNT" -gt 0 ]; then
        log_warning "Found $ERROR_COUNT errors in recent logs"
        echo "Recent errors:"
        pm2 logs tg-crypto-signal --lines 100 --nostream 2>/dev/null | grep -i error | tail -5
    else
        log_success "No recent errors found ✓"
    fi
fi

echo ""

# Check SSL certificate (if configured)
log_info "Checking SSL certificate..."
if [ -f "/etc/letsencrypt/live/$(hostname)/cert.pem" ]; then
    CERT_EXPIRY=$(openssl x509 -in /etc/letsencrypt/live/$(hostname)/cert.pem -noout -enddate 2>/dev/null | cut -d'=' -f2)
    CERT_DAYS_LEFT=$(echo $(( ($(date -d "$CERT_EXPIRY" +%s) - $(date +%s)) / 86400 )))

    if [ "$CERT_DAYS_LEFT" -lt 30 ]; then
        log_warning "SSL certificate expires in $CERT_DAYS_LEFT days"
        if [ "$CERT_DAYS_LEFT" -lt 7 ]; then
            send_alert "SSL certificate expires in $CERT_DAYS_LEFT days"
        fi
    else
        log_success "SSL certificate: Valid ($CERT_DAYS_LEFT days left) ✓"
    fi
else
    log_info "SSL certificate: Not configured"
fi

echo ""
echo "========================================"
echo "📊 Monitoring Summary"
echo "========================================"

# Summary
echo "Services: $SERVICES_OK/$SERVICES_TOTAL running"
echo "Health Check: $([ "$HTTP_CODE" = "200" ] && echo "✓" || echo "✗")"
echo "System Resources:"
echo "  • CPU: $CPU_USAGE%"
echo "  • Memory: $MEMORY_USAGE%"
echo "  • Disk: $DISK_USAGE%"

if [ $SERVICES_OK -eq $SERVICES_TOTAL ] && [ "$HTTP_CODE" = "200" ]; then
    log_success "✅ All systems operational!"
else
    log_error "⚠️  Some systems need attention"
fi

echo ""
echo "Log file: $LOG_FILE"
echo "Next check: $(date -d '+5 minutes' '+%H:%M:%S')"

# Optional: Send summary email
if [ -n "$ALERT_EMAIL" ]; then
    SUMMARY="Monitoring Summary:
Services: $SERVICES_OK/$SERVICES_TOTAL running
Health Check: $([ "$HTTP_CODE" = "200" ] && echo "OK" || echo "Failed")
CPU: $CPU_USAGE%, Memory: $MEMORY_USAGE%, Disk: $DISK_USAGE%
Last check: $(date)"

    echo "$SUMMARY" | mail -s "Crypto Trading Bot - Daily Health Report" $ALERT_EMAIL 2>/dev/null || true
fi

log_success "🎉 Monitoring completed!"
