-- Create memes table for Meme Cafe feature
-- Run this migration in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS memes (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  walletPublicKey VARCHAR(44) NOT NULL,
  imageUrl TEXT NOT NULL,
  relatedToken VARCHAR(44) NULL,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on walletPublicKey for faster queries
CREATE INDEX IF NOT EXISTS idx_memes_wallet_public_key ON memes(walletPublicKey);

-- Create index on relatedToken for faster queries
CREATE INDEX IF NOT EXISTS idx_memes_related_token ON memes(relatedToken);

-- Create index on createdAt for faster sorting
CREATE INDEX IF NOT EXISTS idx_memes_created_at ON memes(createdAt DESC);

-- Add comment to table
COMMENT ON TABLE memes IS 'Stores meme information for the Meme Cafe feature';

