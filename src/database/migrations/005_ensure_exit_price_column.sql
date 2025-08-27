-- Migration: 005_ensure_exit_price_column.sql
-- Description: Ensure exit_price column exists and is properly set up

-- Add exit_price column if it doesn't exist
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS exit_price DECIMAL(20,8);

-- Ensure closed_at column exists (it should already exist based on initial schema)
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;

-- Update any existing closed positions to have the required fields
UPDATE positions 
SET exit_price = COALESCE(current_price, entry_price, 0),
    closed_at = COALESCE(closed_at, NOW())
WHERE status = 'closed' AND (exit_price IS NULL OR closed_at IS NULL);

-- Drop existing constraint if it exists
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_status_check;

-- Add constraint to ensure proper data integrity for closed positions
-- This constraint ensures that when a position is closed, all required fields are set
ALTER TABLE positions 
ADD CONSTRAINT positions_status_check 
CHECK (
  (status = 'open' AND closed_at IS NULL) 
  OR 
  (status = 'closed' AND closed_at IS NOT NULL AND exit_price IS NOT NULL)
  OR
  (status = 'partially_closed' AND closed_at IS NULL)
);