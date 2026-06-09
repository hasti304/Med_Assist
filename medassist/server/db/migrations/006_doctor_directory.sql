-- Migration 006: Public doctor directory (name column, nullable user_id)

ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Allow directory-only doctors without login accounts
ALTER TABLE doctor_profiles ALTER COLUMN user_id DROP NOT NULL;
