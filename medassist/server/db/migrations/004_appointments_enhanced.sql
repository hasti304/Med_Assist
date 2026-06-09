-- Migration 004: Enhanced appointments (cancel restriction, doctor reschedule, email triggers)

-- Add 'cancelled' to status allowed values (Postgres CHECK constraints can't be altered easily,
-- so we drop the implicit default and add cancelled via application logic; status is VARCHAR so it works)

-- Add doctor_notes column for doctor's response / reason
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_notes TEXT;

-- Track when appointment was cancelled
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

-- Track when doctor proposed a new time (reschedule)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_proposed_at TIMESTAMP;

-- Add 'cancelled' and 'rescheduled' to known status values (informational comment only — VARCHAR allows it)
-- Status flow:
--   pending → accepted | declined | cancelled (by patient if >24h before scheduled_at)
--   accepted → completed | cancelled (by doctor anytime, by patient if >24h away)
--   accepted → rescheduled (doctor proposes new time) → accepted again with new scheduled_at
