#!/bin/bash

# ============================================
# Backup Script for Crypto Trading Bot
# ============================================
# This script creates backups of database and application files

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKUP_DIR="/var/backups/tg-crypto-signal"
PROJECT_DIR="/var/www/tg-crypto-signal"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="backup_$TIMESTAMP"

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

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    log_info "Creating backup directory..."
    sudo mkdir -p $BACKUP_DIR
    sudo chown $USER:$USER $BACKUP_DIR
fi

log_info "🚀 Starting backup: $BACKUP_NAME"

# Create backup subdirectory
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
mkdir -p $BACKUP_PATH

# Backup database
log_info "📊 Backing up PostgreSQL database..."
if command -v pg_dump &> /dev/null; then
    # Get database name from .env file
    if [ -f "$PROJECT_DIR/.env" ]; then
        DB_NAME=$(grep "DB_NAME" $PROJECT_DIR/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        DB_USER=$(grep "DB_USER" $PROJECT_DIR/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        DB_HOST=$(grep "DB_HOST" $PROJECT_DIR/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        DB_PORT=$(grep "DB_PORT" $PROJECT_DIR/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'")

        if [ -n "$DB_NAME" ]; then
            log_info "Database: $DB_NAME"
            pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $BACKUP_PATH/database.sql
            log_success "Database backup completed ✓"
        else
            log_warning "Database name not found in .env file"
        fi
    else
        log_warning ".env file not found, skipping database backup"
    fi
else
    log_warning "pg_dump not available, skipping database backup"
fi

# Backup application files
log_info "📁 Backing up application files..."
if [ -d "$PROJECT_DIR" ]; then
    # Create tar archive excluding node_modules, logs, and other large directories
    cd $PROJECT_DIR
    tar -czf $BACKUP_PATH/app_files.tar.gz \
        --exclude='node_modules' \
        --exclude='logs' \
        --exclude='.git' \
        --exclude='*.log' \
        --exclude='dist' \
        --exclude='backups' \
        .
    log_success "Application files backup completed ✓"
else
    log_warning "Project directory not found"
fi

# Backup configuration files
log_info "⚙️ Backing up configuration files..."
if [ -f "$PROJECT_DIR/.env" ]; then
    cp $PROJECT_DIR/.env $BACKUP_PATH/.env.backup
    log_success "Environment configuration backed up ✓"
fi

if [ -f "$PROJECT_DIR/ecosystem.config.js" ]; then
    cp $PROJECT_DIR/ecosystem.config.js $BACKUP_PATH/ecosystem.config.js.backup
    log_success "PM2 configuration backed up ✓"
fi

# Backup Nginx configuration if exists
if [ -f "/etc/nginx/sites-available/tg-crypto-signal" ]; then
    sudo cp /etc/nginx/sites-available/tg-crypto-signal $BACKUP_PATH/nginx.conf.backup
    log_success "Nginx configuration backed up ✓"
fi

# Create backup manifest
log_info "📋 Creating backup manifest..."
cat > $BACKUP_PATH/manifest.txt << EOF
Backup Information
==================
Created: $(date)
Backup Name: $BACKUP_NAME
Server: $(hostname)
User: $(whoami)

Contents:
$(ls -la $BACKUP_PATH)

System Information:
- OS: $(lsb_release -d 2>/dev/null | cut -f2 || uname -s)
- Node.js: $(node --version 2>/dev/null || echo "Not installed")
- PostgreSQL: $(psql --version 2>/dev/null | head -1 || echo "Not installed")
- PM2: $(pm2 --version 2>/dev/null || echo "Not installed")

Application Status:
$(pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.status 2>/dev/null || echo "Not running"')
EOF

# Calculate backup size
BACKUP_SIZE=$(du -sh $BACKUP_PATH | cut -f1)
log_success "Backup size: $BACKUP_SIZE"

# Create compressed archive
log_info "📦 Creating compressed backup archive..."
cd $BACKUP_DIR
tar -czf ${BACKUP_NAME}.tar.gz $BACKUP_NAME
rm -rf $BACKUP_NAME

FINAL_SIZE=$(du -sh ${BACKUP_NAME}.tar.gz | cut -f1)
log_success "Compressed backup: $FINAL_SIZE"

# Clean up old backups (keep last 7 days)
log_info "🧹 Cleaning up old backups..."
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete

echo ""
echo "========================================"
echo "✅ Backup completed successfully!"
echo "========================================"
echo "Backup Location: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
echo "Backup Size: $FINAL_SIZE"
echo "Contents:"
echo "  • Database dump"
echo "  • Application files"
echo "  • Configuration files"
echo "  • Backup manifest"
echo ""
echo "To restore from backup:"
echo "  cd $BACKUP_DIR"
echo "  tar -xzf ${BACKUP_NAME}.tar.gz"
echo "  # Then follow restore procedures in documentation"
echo ""
echo "Old backups (7+ days) have been cleaned up."

# Optional: Upload to remote storage (uncomment and configure)
# log_info "☁️ Uploading to remote storage..."
# scp $BACKUP_DIR/${BACKUP_NAME}.tar.gz user@remote-server:/path/to/backups/

log_success "🎉 Backup process completed!"
