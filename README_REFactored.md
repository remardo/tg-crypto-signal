# Crypto Trading Bot Service - Refactored

A streamlined version of the comprehensive service for monitoring Telegram channels with cryptocurrency trading signals and executing automated trades on BingX exchange.

## 🚀 Core Features

### Main Functionality
- **Telegram Channel Monitoring**: Monitor multiple Telegram channels for trading signals
- **AI Signal Recognition**: Advanced signal parsing with high accuracy
- **Automated Trading**: Execute trades automatically on BingX exchange
- **Risk Management**: Position sizing and leverage controls
- **Real-time Dashboard**: Live monitoring of positions and signals

### Signal Recognition
- Parses trading signals with high accuracy
- Extracts: coin, direction (LONG/SHORT), leverage, entry price, take-profit levels, stop-loss
- Distinguishes between entry signals and general posts

### Risk Management
- Position sizing based on account balance
- Maximum leverage limits
- Stop-loss enforcement
- Take-profit level management

## 🏗️ Architecture

### Technology Stack
- **Backend**: Node.js with Express
- **Database**: PostgreSQL for persistent data
- **Cache/Queue**: Redis for real-time data and message queuing
- **External APIs**: Telegram Bot API, BingX API
- **WebSockets**: Socket.io for real-time dashboard updates

### Core Services
1. **TelegramService**: Channel monitoring and message capture
2. **SignalRecognitionService**: Signal analysis
3. **SignalFeedService**: Signal processing and management
4. **ExecutionService**: Trade execution with risk management
5. **ChannelService**: Channel management
6. **PositionService**: Position tracking and P&L calculation

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+
- Telegram Bot Token
- BingX API credentials

## ⚙️ Installation

1. **Install dependencies**
```bash
npm install
```

2. **Setup environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Setup database**
```bash
# Create PostgreSQL database
createdb tg_crypto_signal

# Run migrations
npm run migrate
```

4. **Start Redis**
```bash
redis-server
```

5. **Start the application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 📚 API Endpoints

### Channel Management
- `GET /api/channels` - Get all channels
- `POST /api/channels` - Create new channel
- `GET /api/channels/:id` - Get channel details
- `PUT /api/channels/:id` - Update channel settings
- `DELETE /api/channels/:id` - Remove channel

### Signal Management
- `GET /api/signals` - Get signal feed
- `GET /api/signals/pending` - Get pending signals
- `POST /api/signals/:id/approve` - Approve signal
- `POST /api/signals/:id/ignore` - Ignore signal

### Position Management
- `GET /api/positions` - Get all positions
- `GET /api/positions/:id` - Get position details
- `POST /api/positions/:id/close` - Close position

### Dashboard
- `GET /api/dashboard/overview` - Dashboard overview data
- `GET /health` - Service health check

## 🔌 WebSocket Events

Real-time updates through WebSocket connections for signals, positions, and account data.

## 🔧 Configuration

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/tg_crypto_signal

# Redis
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# BingX
BINGX_API_KEY=your_api_key
BINGX_SECRET_KEY=your_secret_key
```

## 🧹 Refactoring Notes

This refactored version removes:
- Development and testing scripts
- Debug utilities
- Empty directories
- Temporary files

Keeping only the essential files needed for production deployment and core functionality.