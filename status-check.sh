#!/bin/bash

# ============================================
# System Status Check Script
# ============================================
# This script checks the status of all system components

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

echo "========================================"
echo "🔍 Crypto Trading Bot - System Status"
echo "========================================"

# Check system resources
log_info "Checking system resources..."
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1"%"}')"
echo "Memory Usage: $(free | grep Mem | awk '{printf "%.2f%%", $3/$2 * 100.0}')"
echo "Disk Usage: $(df -h / | awk 'NR==2 {print $5}')"
echo ""

# Check services
log_info "Checking services..."

# PostgreSQL
if sudo systemctl is-active --quiet postgresql; then
    log_success "PostgreSQL: Running ✓"
else
    log_error "PostgreSQL: Stopped ✗"
fi

# Redis
if sudo systemctl is-active --quiet redis-server; then
    log_success "Redis: Running ✓"
else
    log_error "Redis: Stopped ✗"
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
    if [ "$PM2_STATUS" = "online" ]; then
        log_success "PM2 Application: Running ✓"
        echo "  Status: $PM2_STATUS"
        echo "  Uptime: $(pm2 jlist | jq -r '.[0].pm2_env.pm_uptime 2>/dev/null | xargs -I {} date -d @{} +"%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown")"
        echo "  Memory: $(pm2 jlist | jq -r '.[0].monit.memory 2>/dev/null | xargs -I {} echo "scale=2; {}/1024/1024" | bc 2>/dev/null || echo "0") MB"
    else
        log_error "PM2 Application: Stopped ✗"
        echo "  Status: $PM2_STATUS"
    fi
else
    log_error "PM2: Not installed ✗"
fi

echo ""

# Check health endpoint
log_info "Checking health endpoint..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log_success "Health Check: OK ✓"
    echo "  Response: $(curl -s http://localhost:3000/health | jq -r '.status // "OK"' 2>/dev/null || echo "OK")"
else
    log_error "Health Check: Failed ✗"
fi

echo ""

# Check database connection
log_info "Checking database connection..."
if command -v psql &> /dev/null; then
    if sudo -u postgres psql -c "SELECT 1;" -q 2>/dev/null; then
        log_success "Database Connection: OK ✓"
    else
        log_error "Database Connection: Failed ✗"
    fi
else
    log_warning "PostgreSQL client: Not available"
fi

echo ""

# Check recent logs
log_info "Recent application logs:"
if command -v pm2 &> /dev/null; then
    echo "Last 5 log entries:"
    pm2 logs tg-crypto-signal --lines 5 --nostream 2>/dev/null | tail -5 || echo "No logs available"
else
    echo "PM2 not available"
fi

echo ""
echo "========================================"
echo "📊 System Status Summary"
echo "========================================"

# Summary
SERVICES_OK=0
SERVICES_TOTAL=0

# Count PostgreSQL
SERVICES_TOTAL=$((SERVICES_TOTAL + 1))
if sudo systemctl is-active --quiet postgresql; then
    SERVICES_OK=$((SERVICES_OK + 1))
fi

# Count Redis
SERVICES_TOTAL=$((SERVICES_TOTAL + 1))
if sudo systemctl is-active --quiet redis-server; then
    SERVICES_OK=$((SERVICES_OK + 1))
fi

# Count Application
SERVICES_TOTAL=$((SERVICES_TOTAL + 1))
if [ "$PM2_STATUS" = "online" ]; then
    SERVICES_OK=$((SERVICES_OK + 1))
fi

echo "Services: $SERVICES_OK/$SERVICES_TOTAL running"
echo "Health Check: $(curl -s http://localhost:3000/health > /dev/null 2>&1 && echo "✓" || echo "✗")"

if [ $SERVICES_OK -eq $SERVICES_TOTAL ]; then
    log_success "✅ All systems operational!"
else
    log_warning "⚠️  Some systems need attention"
fi

echo ""
echo "For detailed logs: pm2 logs tg-crypto-signal"
echo "For monitoring: pm2 monit"
echo "For restart: pm2 restart tg-crypto-signal"
