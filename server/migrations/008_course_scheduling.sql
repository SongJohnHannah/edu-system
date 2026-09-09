-- 周排课版本化数据模型
-- 1. courses 表加 effective_from + status（软删除）
-- 2. 新建 course_schedule（覆盖：cascading + 临时窗口）
-- 3. 新建 course_history（被替换值的归档）
-- 4. 回填已有 active 课程到 course_schedule 作为"当前默认"

-- 1. courses 加字段（幂等：先检查列是否存在）
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 'courses'
                     AND COLUMN_NAME = 'effective_from');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE courses ADD COLUMN effective_from DATE DEFAULT (CURDATE())',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 'courses'
                     AND COLUMN_NAME = 'status');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE courses ADD COLUMN status ENUM(''active'',''deleted'') DEFAULT ''active''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 'courses'
                     AND INDEX_NAME = 'idx_courses_status');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_courses_status ON courses(status)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. course_schedule 表
CREATE TABLE IF NOT EXISTS course_schedule (
  id VARCHAR(64) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_from DATE NOT NULL,
  valid_until DATE NULL,
  teacher_id VARCHAR(32) NOT NULL,
  student_ids JSON,
  classroom VARCHAR(100) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(32) NULL,
  INDEX idx_schedule_course_date (course_id, effective_from, valid_until),
  CONSTRAINT fk_schedule_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- 3. course_history 表
CREATE TABLE IF NOT EXISTS course_history (
  id VARCHAR(64) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  effective_from DATE NOT NULL,
  superseded_at DATE NOT NULL,
  teacher_id VARCHAR(32) NOT NULL,
  student_ids JSON,
  classroom VARCHAR(100) DEFAULT '',
  INDEX idx_history_course (course_id, superseded_at)
);

-- 4. 回填：把每条 active 课程的当前值塞进 course_schedule 作为初始默认
--    幂等：靠主键 id ('sch_<course_id>_init') 唯一
INSERT IGNORE INTO course_schedule (id, course_id, effective_from, valid_until, teacher_id, student_ids, classroom, created_at)
SELECT
  CONCAT('sch_', id, '_init') AS id,
  id AS course_id,
  COALESCE(effective_from, CURDATE()) AS effective_from,
  NULL AS valid_until,
  teacher_id,
  student_ids,
  classroom,
  NOW() AS created_at
FROM courses
WHERE status = 'active';