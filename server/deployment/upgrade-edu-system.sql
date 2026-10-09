-- 正式数据库升级 SQL
-- 基线：用户提供的 edu_system_g.sql，MariaDB 11.8.6。
-- 先备份并暂停应用写入，在客户端选中正式数据库后执行整个文件。
-- 仅补充缺失结构，不清空、重建已有表，不修改已有业务记录。
-- 已存在的同名表、字段和索引会跳过，重复执行可能出现提示性警告。
-- 原库课时字段已为 DECIMAL，hour_records.type 已包含 subtract，无须修改。
-- MariaDB 的 JSON 为 LONGTEXT utf8mb4_bin 别名，旧名单字段保持原样。
-- 旧 course_schedule、course_history、courses.status/effective_from 保留。
-- 注意：新版代码不读取这些旧排课历史表或旧课程状态/生效字段。
-- 本文件补齐新版所需结构；旧排课历史的数据映射需要另行处理。
-- 建表、改表会隐式提交，遇到错误应停止，不能依赖一个事务整体回滚。
-- 语法依据：https://mariadb.com/docs/server/reference/sql-statements/data-definition/alter/alter-table

SELECT DATABASE() AS target_database, VERSION() AS server_version;

-- 先核对原有业务表；只检查结构，不读取业务记录。
SELECT id, created_by, creator_id, total_hours, used_hours, is_test FROM students LIMIT 0;
SELECT id, teacher_id, hours_per_class, is_test FROM courses LIMIT 0;
SELECT id, course_id, date, recorded_by, hours_deducted, is_test FROM attendance LIMIT 0;
SELECT id, student_id, type, hours, is_test FROM hour_records LIMIT 0;
SELECT id, status, is_test FROM teachers LIMIT 0;
SELECT id, username, password_hash, is_test FROM users LIMIT 0;
SELECT id, course_id, is_test FROM course_handovers LIMIT 0;
SELECT setting_key, setting_value FROM settings LIMIT 0;

-- 学生报名阶段：既有学生默认已报名。
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS enrollment_stage ENUM('pending', 'enrolled') NOT NULL DEFAULT 'enrolled';

-- 课程归档与生效日期：保持 NULL，不推测旧记录的状态和生效时间。
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS effective_start_date DATE NULL;

-- 点名撤销、名称/名单快照、原始课次和时间快照。
-- 旧记录保留 NULL，由新版代码为新记录写入实际快照。
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS voided_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS course_name_snapshot VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  ADD COLUMN IF NOT EXISTS teacher_name_snapshot VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  ADD COLUMN IF NOT EXISTS student_names_snapshot JSON NULL,
  ADD COLUMN IF NOT EXISTS original_student_ids JSON NULL,
  ADD COLUMN IF NOT EXISTS original_date DATE NULL,
  ADD COLUMN IF NOT EXISTS start_time_snapshot VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  ADD COLUMN IF NOT EXISTS end_time_snapshot VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  ADD INDEX IF NOT EXISTS idx_attendance_occurrence (course_id, date, original_date);

-- 原正式库缺少 classes，新版备份/恢复的表清单需要此表。
CREATE TABLE IF NOT EXISTS classes (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 点名撤销和逐学生课时冲正记录。
CREATE TABLE IF NOT EXISTS attendance_reversals (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  attendance_id VARCHAR(32) NOT NULL,
  student_id VARCHAR(32) NOT NULL,
  hours DECIMAL(8,1) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_reversal (attendance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 固定课表从某周开始生效的版本。
CREATE TABLE IF NOT EXISTS course_schedule_versions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_week_start DATE NOT NULL,
  weekday TINYINT NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schedule_version (course_id, effective_week_start),
  INDEX idx_schedule_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 按原课程和原日期定位的单次调课。
CREATE TABLE IF NOT EXISTS course_occurrence_changes (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  original_date DATE NOT NULL,
  target_date DATE NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_occurrence_change (course_id, original_date),
  INDEX idx_occurrence_target (target_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 正式学生名单的历史版本。
CREATE TABLE IF NOT EXISTS course_roster_versions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_at DATETIME NOT NULL,
  student_ids JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_roster_course (course_id, effective_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 独立试听和依附正式课次的试听预约。
CREATE TABLE IF NOT EXISTS trial_bookings (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 名称、教室、每次课时的历史版本。
CREATE TABLE IF NOT EXISTS course_detail_versions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_at DATETIME(3) NOT NULL,
  name VARCHAR(200) NOT NULL,
  classroom VARCHAR(100) NOT NULL DEFAULT '',
  hours_per_class DECIMAL(8,1) NOT NULL,
  INDEX idx_detail_course (course_id, effective_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '正式数据库升级 SQL 执行完成' AS result, DATABASE() AS target_database;
