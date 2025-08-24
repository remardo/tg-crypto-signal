-- Migration: 002_add_tp_percentages.sql
-- Description: Add take profit percentage configuration to channels

-- Add take profit percentages configuration to channels
ALTER TABLE channels 
ADD COLUMN tp_percentages DECIMAL(5,2)[] DEFAULT ARRAY[25.0, 25.0, 50.0];

-- Add comment explaining the default behavior
COMMENT ON COLUMN channels.tp_percentages IS 'Array of percentages to close at each take profit level. Default: [25%, 25%, 50%] for 3 TP levels';

-- Add take profit percentages to positions table for tracking actual execution
ALTER TABLE positions 
ADD COLUMN tp_percentages DECIMAL(5,2)[];

COMMENT ON COLUMN positions.tp_percentages IS 'Array of percentages used for this position at each TP level';