-- 仅在部署包含 013 代课功能的新代码时执行（MariaDB 11.8.6）。
-- 这是 upgrade-edu-system.sql 之后新增的结构补充，不是旧数据转换。
-- 新表初始为空，旧点名的 teaching_teacher_id 保留 NULL；可重复执行。

SELECT DATABASE() AS target_database, VERSION() AS server_version;

CREATE TABLE IF NOT EXISTS course_substitutions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS teaching_teacher_id VARCHAR(32) NULL;

SELECT '代课功能结构补充完成' AS result;
