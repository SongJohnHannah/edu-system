-- An optional start date for recurring courses created for a future displayed week.
-- Existing courses retain their original created_at-based first occurrence.
ALTER TABLE courses ADD COLUMN effective_start_date DATE NULL;
