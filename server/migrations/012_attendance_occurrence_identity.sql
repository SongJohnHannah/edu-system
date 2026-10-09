-- Preserve each attendance record's actual course occurrence without rewriting history.
-- Existing rows stay NULL because their original occurrence cannot always be inferred.
ALTER TABLE attendance
  ADD COLUMN original_date DATE NULL,
  ADD COLUMN start_time_snapshot VARCHAR(10) NULL,
  ADD COLUMN end_time_snapshot VARCHAR(10) NULL,
  ADD INDEX idx_attendance_occurrence (course_id, date, original_date);
