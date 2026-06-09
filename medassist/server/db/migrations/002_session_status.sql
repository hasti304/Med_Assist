-- Migration 002: Session status tracking + full disease object storage
-- Run against Supabase SQL editor or: psql $DATABASE_URL -f migrations/002_session_status.sql

-- 1. Add status column (tracks where patient is in the flow)
--    Values: pending | diagnosed | tests_ready | report_uploaded | analyzed
ALTER TABLE symptom_sessions
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending';

-- 2. Add full disease object column (VARCHAR selected_disease only stores the name)
ALTER TABLE symptom_sessions
  ADD COLUMN IF NOT EXISTS selected_disease_data JSONB;

-- 3. Backfill existing rows — infer status from what data is already present
-- Sessions with recommended_tests are at least tests_ready
UPDATE symptom_sessions
SET status = 'tests_ready'
WHERE recommended_tests IS NOT NULL
  AND status = 'pending';

-- Sessions with predicted_diseases but no recommended_tests are diagnosed
UPDATE symptom_sessions
SET status = 'diagnosed'
WHERE predicted_diseases IS NOT NULL
  AND recommended_tests IS NULL
  AND status = 'pending';

-- Sessions whose session_id appears in blood_reports with full analysis → analyzed
UPDATE symptom_sessions ss
SET status = 'analyzed'
WHERE EXISTS (
  SELECT 1 FROM blood_reports br
  WHERE br.session_id = ss.id
    AND br.analysis IS NOT NULL
);

-- Sessions whose session_id appears in blood_reports but no analysis yet → report_uploaded
UPDATE symptom_sessions ss
SET status = 'report_uploaded'
WHERE EXISTS (
  SELECT 1 FROM blood_reports br
  WHERE br.session_id = ss.id
    AND br.analysis IS NULL
)
AND ss.status NOT IN ('analyzed');
