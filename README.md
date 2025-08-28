# Crypto Trading Bot Service

A comprehensive service for monitoring Telegram channels with cryptocurrency trading signals and executing automated trades on BingX exchange.

## 🚀 Features

### Core Functionality
- **Telegram Channel Monitoring**: Monitor multiple Telegram channels for trading signals
- **AI Signal Recognition**: Advanced ChatGPT integration with System of Thought (SOT) for accurate signal parsing
- **Automated Trading**: Execute trades automatically on BingX exchange with comprehensive risk management
- **Sub-Account Trading**: Isolated trading accounts for each channel to manage risk separately
- **Real-time Dashboard**: Live monitoring of positions, P&L, and signal feed
- **Manual Override**: Manual approval and execution of signals when needed

### Signal Recognition
- Parses Russian/English trading signals with high accuracy
- Extracts: coin, direction (LONG/SHORT), leverage, entry price, take-profit levels, stop-loss
- Distinguishes between entry signals, position updates, and general posts
- Confidence scoring and validation
- Example supported format:
```
Монета: SAND SHORT Х25 ⤴️
🔵Цена входа: 0.29889
✅Тэйки: 0.29618 0.29293 0.27341
🛑Стоп: 0.31235
Входим на 10$
```

### Risk Management
- Position sizing based on % of account balance
- Maximum leverage limits
- Stop-loss enforcement
- Take-profit level management
- Maximum open positions per channel
- Risk/reward ratio validation

### Channel Management
- Add/remove Telegram channels
- Pause/resume monitoring
- Configure auto-execution settings
- Set position size and risk parameters
- Transfer funds between main and sub-accounts

## 🏗️ Architecture

### Technology Stack
- **Backend**: Node.js with Express
- **Database**: PostgreSQL for persistent data
- **Cache/Queue**: Redis for real-time data and message queuing
- **External APIs**: Telegram Bot API, BingX API, OpenAI API
- **WebSockets**: Socket.io for real-time dashboard updates

### Core Services
1. **TelegramService**: Channel monitoring and message capture
2. **SignalRecognitionService**: ChatGPT-powered signal analysis with SOT
3. **SignalFeedService**: Signal processing and management
4. **ExecutionService**: Trade execution with risk management
5. **ChannelService**: Channel and sub-account management
6. **PositionService**: Position tracking and P&L calculation
7. **WebSocketService**: Real-time dashboard communication

### Database Schema
- **channels**: Telegram channel configurations
- **signals**: Processed trading signals
- **positions**: Active and closed trading positions
- **sub_accounts**: BingX sub-account information
- **orders**: Individual order tracking

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+
- Telegram Bot Token
- BingX API credentials
- OpenAI API key

## ⚙️ Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd tg_crypto_signal
```

2. **Install dependencies**
```bash
npm install
```

3. **Build frontend assets**
```bash
# Development build
npm run build:dev

# Production build
npm run build
```

4. **Setup environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

5. **Setup database**
```bash
# Create PostgreSQL database
createdb tg_crypto_signal

# Run migrations
npm run migrate
```

6. **Start Redis**
```bash
redis-server
```

7. **Start the application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 📚 API Documentation

### Channel Management
- `GET /api/channels` - Get all channels
- `POST /api/channels` - Create new channel
- `GET /api/channels/:id` - Get channel details
- `PUT /api/channels/:id` - Update channel settings
- `DELETE /api/channels/:id` - Remove channel
- `POST /api/channels/:id/pause` - Pause channel
- `POST /api/channels/:id/resume` - Resume channel
- `POST /api/channels/:id/transfer` - Transfer funds to channel

### Signal Management
- `GET /api/signals` - Get signal feed
- `GET /api/signals/pending` - Get pending signals
- `POST /api/signals/:id/approve` - Approve signal
- `POST /api/signals/:id/ignore` - Ignore signal
- `POST /api/signals/:id/execute` - Execute signal manually
- `POST /api/signals/test-recognition` - Test signal recognition

### Position Management
- `GET /api/positions` - Get all positions
- `GET /api/positions/:id` - Get position details
- `POST /api/positions/:id/close` - Close position
- `PUT /api/positions/:id/modify` - Modify position (SL/TP)

### Dashboard
- `GET /api/dashboard/overview` - Dashboard overview data
- `GET /health` - Service health check

## 🔌 WebSocket Events

### Client to Server
- `subscribe` - Subscribe to data feeds
- `unsubscribe` - Unsubscribe from feeds
- `request_data` - Request current data

### Server to Client
- `notification` - Real-time updates
- `data_response` - Requested data response
- `connected` - Connection confirmation

### Available Channels
- `signal:new` - New signals
- `signal:executed` - Signal executions
- `position:update` - Position updates
- `position:closed` - Position closures
- `account:update` - Account balance updates
- `channel:update` - Channel status changes

## 🔧 Configuration

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/tg_crypto_signal

# Redis
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# BingX
BINGX_API_KEY=your_api_key
BINGX_SECRET_KEY=your_secret_key

# OpenAI
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4-turbo-preview

# Trading
MAX_LEVERAGE=50
MAX_POSITION_PERCENTAGE=50
DEFAULT_RISK_PERCENTAGE=2
MIN_SIGNAL_CONFIDENCE=0.8
```

### Channel Configuration
```json
{
  "telegramChannelId": "-1001234567890",
  "name": "Premium Signals",
  "maxPositionPercentage": 10.0,
  "autoExecute": false,
  "riskPercentage": 2.0,
  "initialBalance": 1000
}
```

## 📊 Usage Examples

### Adding a Channel
```javascript
const channelData = {
  telegramChannelId: "-1001234567890",
  name: "Premium Crypto Signals",
  description: "High-quality trading signals",
  maxPositionPercentage: 15.0,
  autoExecute: true,
  riskPercentage: 2.5,
  initialBalance: 1000
};

const response = await fetch('/api/channels', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(channelData)
});
```

### Manual Signal Execution
```javascript
const executionParams = {
  positionSize: 100,
  leverage: 20
};

await fetch(`/api/signals/${signalId}/execute`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(executionParams)
});
```

### WebSocket Connection
```javascript
const socket = io('http://localhost:3001');

// Subscribe to real-time updates
socket.emit('subscribe', {
  channels: ['signal:new', 'position:update']
});

// Handle notifications
socket.on('notification', (data) => {
  console.log('Real-time update:', data);
});
```

## 🛡️ Security Features

- Request rate limiting
- Input validation and sanitization
- Error handling and logging
- API key encryption
- Sub-account isolation
- Risk management enforcement

## 📈 Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Service Status
- Telegram connection status
- Signal processing queue size
- Active executions
- WebSocket connections
- Database connectivity

### Logging
- Application logs: `logs/app.log`
- Trading logs: `logs/trading.log`
- Signal logs: `logs/signals.log`
- Error logs: `logs/error.log`

## 🧪 Testing

```bash
# Run tests
npm test

# Test signal recognition
curl -X POST http://localhost:3000/api/signals/test-recognition \
  -H "Content-Type: application/json" \
  -d '{"message": "Монета: BTC LONG Х10 🔵Цена входа: 45000"}'
```

## 📝 Development

### Project Structure
```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── services/        # Business logic services
├── models/          # Database models
├── middleware/      # Express middleware
├── routes/          # API routes
├── database/        # Database migrations
├── utils/           # Utility functions
├── jobs/            # Background jobs
├── websocket/       # WebSocket handlers
└── server.js        # Main server file
```

### Adding New Features
1. Create service in `src/services/`
2. Add database models if needed
3. Create API routes in `src/routes/`
4. Add WebSocket events if real-time updates needed
5. Update documentation

## 🚨 Error Handling

The system includes comprehensive error handling:
- API validation errors
- Database connection errors
- External API failures
- Trading execution errors
- Real-time notification errors

All errors are logged with context and returned with appropriate HTTP status codes.

## 🔄 Backup and Recovery

### Database Backup
```bash
pg_dump tg_crypto_signal > backup.sql
```

### Redis Backup
```bash
redis-cli BGSAVE
```

## � VPS Deployment

### Prerequisites
- Ubuntu/Debian server with sudo access
- Node.js 18+ installed
- PostgreSQL installed and running
- Redis installed and running
- PM2 process manager (optional but recommended)

### VPS Setup Steps

1. **Update system and install dependencies**
```bash
sudo apt update
sudo apt install -y curl wget git
```

2. **Install Node.js 18+**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Install PostgreSQL and Redis**
```bash
sudo apt install -y postgresql postgresql-contrib redis-server
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

4. **Install PM2 globally**
```bash
sudo npm install -g pm2
```

5. **Clone and setup project**
```bash
git clone <your-repository-url>
cd tg_crypto_signal
npm install
```

6. **Build frontend assets**
```bash
npm run build
```

7. **Setup environment**
```bash
cp .env.example .env
# Edit .env with your production credentials
```

8. **Setup database**
```bash
sudo -u postgres createdb tg_crypto_signal
sudo -u postgres createuser --interactive --pwprompt tg_crypto_user
npm run migrate
```

9. **Start with PM2**
```bash
pm2 start src/server.js --name "tg-crypto-signal"
pm2 save
pm2 startup
```

10. **Setup Nginx (optional)**
```bash
sudo apt install -y nginx
# Configure nginx to proxy to localhost:3000
```

### Troubleshooting VPS Issues

#### Build Errors
If you get `postcss-loader` errors during build:
```bash
# Clean node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### Missing Dependencies
```bash
# Install missing build tools
sudo apt-get install -y build-essential
```

#### Permission Issues
```bash
# Fix npm permissions
sudo chown -R $USER:$USER ~/.npm
```

## �📞 Support

For issues and questions:
1. Check the logs in `logs/` directory
2. Verify configuration in `.env` file
3. Test API endpoints with health check
4. Check WebSocket connection status

## 📄 License

MIT License - see LICENSE file for details.

---

**⚠️ Warning**: This is a trading bot that can execute real trades. Always test thoroughly in a demo environment before using with real funds. Trading cryptocurrencies involves significant risk.