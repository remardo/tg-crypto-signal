-- Migration: 003_add_exit_price_and_constraints.sql
-- Description: Add exit_price column to positions table and fix constraints

-- Add exit_price column to positions table (using existing closed_at column)
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS exit_price DECIMAL(20,8);

-- Update any existing closed positions to have the required fields
UPDATE positions 
SET exit_price = COALESCE(current_price, entry_price, 0)
WHERE status = 'closed' AND exit_price IS NULL;

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