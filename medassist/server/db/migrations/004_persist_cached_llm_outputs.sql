-- Persist LLM-generated outputs to DB so they survive server restarts
-- and are not re-generated on every page load.

ALTER TABLE blood_reports
  ADD COLUMN IF NOT EXISTS daily_tips JSONB,
  ADD COLUMN IF NOT EXISTS daily_tips_generated_at TIMESTAMP;

ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS vitals_insights JSONB;

ALTER TABLE blood_reports
  ADD COLUMN IF NOT EXISTS translations JSONB;
