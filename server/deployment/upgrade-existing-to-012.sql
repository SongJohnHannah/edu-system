-- 现有教务数据库升级至迁移 012（涵盖 003～012）。
-- 先在客户端选中正式数据库；本文件不创建数据库、不包含 USE。
-- 适用于项目标准旧库，要求 001 的 8 张基础表已经存在。
-- 字段和索引已存在则跳过；新表已存在则保留；课时类型已符合则跳过。
-- 执行前备份并暂停应用写入；遇到错误立即停止，不要启用 --force。
-- MySQL DDL 会隐式提交，不能通过一个事务整体回滚。
-- 004 仅在首次新增 recorded_by 时回填旧点名的当前授课教师。
-- 012 的历史原始日期和时间快照保留 NULL，不推测、不重写历史。
SELECT DATABASE() AS target_database, VERSION() AS mysql_version;
SELECT id FROM users LIMIT 0;
SELECT id, total_hours, used_hours FROM students LIMIT 0;
SELECT id FROM teachers LIMIT 0;
SELECT id, teacher_id, hours_per_class FROM courses LIMIT 0;
SELECT id, course_id, hours_deducted FROM attendance LIMIT 0;
SELECT id, type, hours FROM hour_records LIMIT 0;
SELECT id FROM classes LIMIT 0;
SELECT setting_key FROM settings LIMIT 0;
SET @edu_original_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = IF(FIND_IN_SET('STRICT_ALL_TABLES', @edu_original_sql_mode),
  @edu_original_sql_mode, CONCAT_WS(',', NULLIF(@edu_original_sql_mode, ''), 'STRICT_ALL_TABLES'));

-- 003_add_student_creator.sql
SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'created_by'),
  'DO 0', 'ALTER TABLE students ADD COLUMN created_by ENUM(''admin'', ''teacher'') NOT NULL DEFAULT ''admin''');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'creator_id'),
  'DO 0', 'ALTER TABLE students ADD COLUMN creator_id VARCHAR(32) DEFAULT NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND INDEX_NAME = 'idx_students_creator'),
  'DO 0', 'ALTER TABLE students ADD INDEX idx_students_creator (creator_id)');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

-- 004_teacher_handover.sql
SET @edu_added_recorded_by = NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'recorded_by');

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'recorded_by'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN recorded_by VARCHAR(32) DEFAULT NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND INDEX_NAME = 'idx_attendance_recorded_by'),
  'DO 0', 'ALTER TABLE attendance ADD INDEX idx_attendance_recorded_by (recorded_by)');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(NOT @edu_added_recorded_by,
  'DO 0', 'UPDATE attendance a JOIN courses c ON a.course_id = c.id
SET a.recorded_by = c.teacher_id WHERE a.recorded_by IS NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

CREATE TABLE IF NOT EXISTS course_handovers (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  course_name VARCHAR(200) NOT NULL,
  old_teacher_id VARCHAR(32) NOT NULL,
  old_teacher_name VARCHAR(100) NOT NULL,
  new_teacher_id VARCHAR(32) NOT NULL,
  new_teacher_name VARCHAR(100) NOT NULL,
  performed_by VARCHAR(50) NOT NULL COMMENT '操作的管理员用户名',
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_handovers_course (course_id),
  INDEX idx_handovers_created (created_at)
);

-- 005_is_test_flag.sql
SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'is_test'),
  'DO 0', 'ALTER TABLE students ADD COLUMN is_test TINYINT(1) DEFAULT 0');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND COLUMN_NAME = 'is_test'),
  'DO 0', 'ALTER TABLE teachers ADD COLUMN is_test TINYINT(1) DEFAULT 0');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'is_test'),
  'DO 0', 'ALTER TABLE courses ADD COLUMN is_test TINYINT(1) DEFAULT 0');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'is_test'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN is_test TINYINT(1) DEFAULT 0');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hour_records' AND COLUMN_NAME = 'is_test'),
  'DO 0', 'ALTER TABLE hour_records ADD COLUMN is_test TINYINT(1) DEFAULT 0');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_handovers' AND COLUMN_NAME = 'is_test'),
  'DO 0', 'ALTER TABLE course_handovers ADD COLUMN is_test TINYINT(1) DEFAULT 0');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

-- 006_teacher_soft_delete.sql
SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND COLUMN_NAME = 'status'),
  'DO 0', 'ALTER TABLE teachers ADD COLUMN status ENUM(''active'', ''deleted'') DEFAULT ''active''');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND INDEX_NAME = 'idx_teachers_status'),
  'DO 0', 'ALTER TABLE teachers ADD INDEX idx_teachers_status (status)');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

-- 007_decimal_hours.sql
SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'total_hours'
    AND COLUMN_TYPE = 'decimal(8,1)'),
  'DO 0', 'ALTER TABLE students MODIFY COLUMN total_hours DECIMAL(8,1) DEFAULT 0');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'used_hours'
    AND COLUMN_TYPE = 'decimal(8,1)'),
  'DO 0', 'ALTER TABLE students MODIFY COLUMN used_hours DECIMAL(8,1) DEFAULT 0');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'hours_per_class'
    AND COLUMN_TYPE = 'decimal(4,1)'),
  'DO 0', 'ALTER TABLE courses MODIFY COLUMN hours_per_class DECIMAL(4,1) DEFAULT 1');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'hours_deducted'
    AND COLUMN_TYPE = 'decimal(4,1)'),
  'DO 0', 'ALTER TABLE attendance MODIFY COLUMN hours_deducted DECIMAL(4,1) DEFAULT 1');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hour_records' AND COLUMN_NAME = 'hours'
    AND COLUMN_TYPE = 'decimal(8,1)'),
  'DO 0', 'ALTER TABLE hour_records MODIFY COLUMN hours DECIMAL(8,1) NOT NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

-- 008_shared_schedule_and_trials.sql
SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'enrollment_stage'),
  'DO 0', 'ALTER TABLE students ADD COLUMN enrollment_stage ENUM(''pending'', ''enrolled'') NOT NULL DEFAULT ''enrolled''');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'archived_at'),
  'DO 0', 'ALTER TABLE courses ADD COLUMN archived_at DATETIME NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'voided_at'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN voided_at DATETIME NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'course_name_snapshot'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN course_name_snapshot VARCHAR(200) NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'teacher_name_snapshot'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN teacher_name_snapshot VARCHAR(100) NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'student_names_snapshot'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN student_names_snapshot JSON NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'original_student_ids'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN original_student_ids JSON NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

CREATE TABLE IF NOT EXISTS attendance_reversals (
  id VARCHAR(32) PRIMARY KEY,
  attendance_id VARCHAR(32) NOT NULL,
  student_id VARCHAR(32) NOT NULL,
  hours DECIMAL(8,1) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_reversal (attendance_id)
);

CREATE TABLE IF NOT EXISTS course_schedule_versions (
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

CREATE TABLE IF NOT EXISTS course_occurrence_changes (
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

CREATE TABLE IF NOT EXISTS course_roster_versions (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_at DATETIME NOT NULL,
  student_ids JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_roster_course (course_id, effective_at)
);

CREATE TABLE IF NOT EXISTS trial_bookings (
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

-- 009_course_detail_history.sql
CREATE TABLE IF NOT EXISTS course_detail_versions (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_at DATETIME(3) NOT NULL,
  name VARCHAR(200) NOT NULL,
  classroom VARCHAR(100) NOT NULL DEFAULT '',
  hours_per_class DECIMAL(8,1) NOT NULL,
  INDEX idx_detail_course (course_id, effective_at)
);

-- 010_course_effective_start.sql
SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'effective_start_date'),
  'DO 0', 'ALTER TABLE courses ADD COLUMN effective_start_date DATE NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

-- 011_manual_hour_subtract.sql
SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hour_records' AND COLUMN_NAME = 'type'
    AND COLUMN_TYPE = 'enum(''add'',''subtract'',''deduct'',''restore'')'),
  'DO 0', 'ALTER TABLE hour_records
  MODIFY COLUMN type ENUM(''add'', ''subtract'', ''deduct'', ''restore'') NOT NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

-- 012_attendance_occurrence_identity.sql
SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'original_date'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN original_date DATE NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'start_time_snapshot'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN start_time_snapshot VARCHAR(10) NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'end_time_snapshot'),
  'DO 0', 'ALTER TABLE attendance ADD COLUMN end_time_snapshot VARCHAR(10) NULL');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET @edu_sql = IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND INDEX_NAME = 'idx_attendance_occurrence'),
  'DO 0', 'ALTER TABLE attendance ADD INDEX idx_attendance_occurrence (course_id, date, original_date)');
PREPARE edu_upgrade FROM @edu_sql;
EXECUTE edu_upgrade;
DEALLOCATE PREPARE edu_upgrade;

SET SESSION sql_mode = @edu_original_sql_mode;

SELECT '升级 SQL 执行完成' AS result, DATABASE() AS target_database;
