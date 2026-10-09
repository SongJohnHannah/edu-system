-- Preserve course labels and charging rules for past occurrences.
CREATE TABLE IF NOT EXISTS course_detail_versions (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_at DATETIME(3) NOT NULL,
  name VARCHAR(200) NOT NULL,
  classroom VARCHAR(100) NOT NULL DEFAULT '',
  hours_per_class DECIMAL(8,1) NOT NULL,
  INDEX idx_detail_course (course_id, effective_at)
);
