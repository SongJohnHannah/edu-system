-- Shared teacher office, dated schedule changes, and one-time trial bookings.
ALTER TABLE students ADD COLUMN enrollment_stage ENUM('pending', 'enrolled') NOT NULL DEFAULT 'enrolled';
ALTER TABLE courses ADD COLUMN archived_at DATETIME NULL;
ALTER TABLE attendance ADD COLUMN voided_at DATETIME NULL;
ALTER TABLE attendance ADD COLUMN course_name_snapshot VARCHAR(200) NULL;
ALTER TABLE attendance ADD COLUMN teacher_name_snapshot VARCHAR(100) NULL;
ALTER TABLE attendance ADD COLUMN student_names_snapshot JSON NULL;
ALTER TABLE attendance ADD COLUMN original_student_ids JSON NULL;

CREATE TABLE attendance_reversals (
  id VARCHAR(32) PRIMARY KEY,
  attendance_id VARCHAR(32) NOT NULL,
  student_id VARCHAR(32) NOT NULL,
  hours DECIMAL(8,1) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_reversal (attendance_id)
);

CREATE TABLE course_schedule_versions (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_week_start DATE NOT NULL,
  weekday TINYINT NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schedule_version (course_id, effective_week_start),
  INDEX idx_schedule_course (course_id)
);

CREATE TABLE course_occurrence_changes (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  original_date DATE NOT NULL,
  target_date DATE NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_occurrence_change (course_id, original_date),
  INDEX idx_occurrence_target (target_date)
);

CREATE TABLE course_roster_versions (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_at DATETIME NOT NULL,
  student_ids JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_roster_course (course_id, effective_at)
);

CREATE TABLE trial_bookings (
  id VARCHAR(32) PRIMARY KEY,
  student_id VARCHAR(32) NOT NULL,
  teacher_id VARCHAR(32) NOT NULL,
  course_id VARCHAR(32) NULL,
  occurrence_date DATE NULL,
  booking_date DATE NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  note TEXT,
  status ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
  course_name_snapshot VARCHAR(200) NULL,
  teacher_name_snapshot VARCHAR(100) NOT NULL,
  student_name_snapshot VARCHAR(100) NOT NULL,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_trial_date (booking_date, status),
  INDEX idx_trial_teacher (teacher_id, booking_date),
  INDEX idx_trial_student (student_id, booking_date),
  INDEX idx_trial_course (course_id, occurrence_date)
);
