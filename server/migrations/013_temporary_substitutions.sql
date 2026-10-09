-- One-time substitute teachers; existing courses and attendance remain unchanged.
CREATE TABLE IF NOT EXISTS course_substitutions (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  original_date DATE NOT NULL,
  teacher_id VARCHAR(32) NOT NULL,
  original_teacher_id VARCHAR(32) NOT NULL,
  reason VARCHAR(500) NOT NULL DEFAULT '',
  arranged_by VARCHAR(100) NOT NULL,
  status ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
  confirmed_conflicts JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  cancelled_by VARCHAR(100) NULL,
  INDEX idx_substitution_occurrence (course_id, original_date, status),
  INDEX idx_substitution_teacher (teacher_id, status)
);

ALTER TABLE attendance ADD COLUMN teaching_teacher_id VARCHAR(32) NULL;
