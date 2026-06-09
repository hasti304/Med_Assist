-- Migration 001: Change recommended_tests column from TEXT[] to JSONB
-- Run this if you created the DB before Day 5

ALTER TABLE symptom_sessions
  ALTER COLUMN recommended_tests TYPE JSONB
  USING CASE
    WHEN recommended_tests IS NULL THEN NULL
    ELSE to_jsonb(recommended_tests)
  END;
