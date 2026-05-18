-- Replace NULL next_step_at with 0 so the (next_step_at, enrollment_status)
-- index is always used. 0 means "run on next cron tick" — any timestamp <= now
-- satisfies the processor's WHERE clause. NULL values are never indexed in
-- SQLite, so the old query required a full table scan for active enrollments.

UPDATE automation_enrollments
SET next_step_at = 0
WHERE next_step_at IS NULL;
