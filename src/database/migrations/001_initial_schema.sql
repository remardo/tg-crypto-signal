-- Migration: 001_initial_schema.sql
-- Description: Create initial database schema for crypto trading bot

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Channels table
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_channel_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_paused BOOLEAN DEFAULT false,
  sub_account_id VARCHAR(255) NOT NULL,
  max_position_percentage DECIMAL(5,2) DEFAULT 10.00,
  auto_execute BOOLEAN DEFAULT false,
  risk_percentage DECIMAL(5,2) DEFAULT 2.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Signals table
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  coin VARCHAR(50) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  leverage INTEGER,
  entry_price DECIMAL(20,8),
  take_profit_levels DECIMAL(20,8)[],
  stop_loss DECIMAL(20,8),
  suggested_volume DECIMAL(20,8),
  confidence_score DECIMAL(3,2) DEFAULT 0.00,
  raw_message TEXT,
  parsed_data JSONB,
  message_timestamp TIMESTAMP,
  processed_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'ignored', 'failed', 'closed')),
  signal_type VARCHAR(20) DEFAULT 'entry' CHECK (signal_type IN ('entry', 'update', 'close', 'general'))
);

-- Positions table
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id UUID REFERENCES signals(id),
  channel_id UUID REFERENCES channels(id),
  sub_account_id VARCHAR(255) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity DECIMAL(20,8) NOT NULL,
  entry_price DECIMAL(20,8),
  current_price DECIMAL(20,8),
  leverage INTEGER,
  unrealized_pnl DECIMAL(20,8) DEFAULT 0.00,
  realized_pnl DECIMAL(20,8) DEFAULT 0.00,
  fees DECIMAL(20,8) DEFAULT 0.00,
  take_profit_levels DECIMAL(20,8)[],
  stop_loss DECIMAL(20,8),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'partially_closed')),
  bingx_order_id VARCHAR(255),
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sub-accounts table
CREATE TABLE sub_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  bingx_sub_account_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  total_balance DECIMAL(20,8) DEFAULT 0.00,
  available_balance DECIMAL(20,8) DEFAULT 0.00,
  unrealized_pnl DECIMAL(20,8) DEFAULT 0.00,
  total_pnl DECIMAL(20,8) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Orders table for tracking individual orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  position_id UUID REFERENCES positions(id),
  bingx_order_id VARCHAR(255) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL,
  type VARCHAR(20) NOT NULL,
  quantity DECIMAL(20,8) NOT NULL,
  price DECIMAL(20,8),
  executed_quantity DECIMAL(20,8) DEFAULT 0.00,
  executed_price DECIMAL(20,8),
  status VARCHAR(20) DEFAULT 'pending',
  order_time TIMESTAMP DEFAULT NOW(),
  executed_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Signal processing logs
CREATE TABLE signal_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID REFERENCES channels(id),
  raw_message TEXT NOT NULL,
  processing_result JSONB,
  confidence_score DECIMAL(3,2),
  is_signal BOOLEAN DEFAULT false,
  error_message TEXT,
  processed_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_channels_telegram_id ON channels(telegram_channel_id);
CREATE INDEX idx_channels_active ON channels(is_active, is_paused);
CREATE INDEX idx_signals_channel_id ON signals(channel_id);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_created ON signals(processed_at);
CREATE INDEX idx_positions_channel_id ON positions(channel_id);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_symbol ON positions(symbol);
CREATE INDEX idx_orders_position_id ON orders(position_id);
CREATE INDEX idx_orders_bingx_id ON orders(bingx_order_id);
CREATE INDEX idx_signal_logs_channel_id ON signal_logs(channel_id);
CREATE INDEX idx_signal_logs_processed ON signal_logs(processed_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sub_accounts_updated_at BEFORE UPDATE ON sub_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();