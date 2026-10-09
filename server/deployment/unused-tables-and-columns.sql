-- 当前 dev 未使用结构的核对与可选删除 SQL。
-- 对照依据：server/migrations/edu_system_1403.sql 与当前 dev 后端代码。
-- 线上运行的代码是否仍使用这些结构尚未验证，不能据此直接删除。
-- 本文件没有存储过程、CALL、自动归档、数据迁移或数据清理。
-- 删除语句全部保持注释：直接执行本文件只查询元数据，不修改任何数据。
--
-- 候选旧表：course_history、course_schedule。
-- 候选旧字段：courses.status、courses.effective_from。
-- 相关旧索引：courses.idx_courses_status，删除 status 时会自动移除。
-- 保留 classes、students.class_id、attendance.recorded_by 及所有 is_test 字段。
-- 保留当前使用的 archived_at、effective_start_date、各版本/历史表及代课表。
-- 删除字段也会永久删除该字段保存的值；DROP TABLE 会永久删除表内全部数据。
-- 因此，线上库使用中且历史数据需要保留时，不要解除下面删除语句的注释。

-- 1. 确认当前选择的数据库。本文件不会自动 USE 或切换数据库。
SELECT DATABASE() AS selected_database, VERSION() AS database_version;

-- 2. 确认候选旧表是否存在。这里只查询结构，不查询或删除业务记录。
SELECT TABLE_NAME, TABLE_TYPE, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('course_history', 'course_schedule')
ORDER BY TABLE_NAME;

-- 3. 确认候选旧字段的实际定义。
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses'
  AND COLUMN_NAME IN ('status', 'effective_from')
ORDER BY ORDINAL_POSITION;

-- 4. 确认旧状态索引。
SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses'
  AND INDEX_NAME = 'idx_courses_status'
ORDER BY SEQ_IN_INDEX;

-- 5. 列出涉及这两张旧表的外键依赖。
SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
  AND (TABLE_NAME IN ('course_history', 'course_schedule')
       OR (REFERENCED_TABLE_SCHEMA = DATABASE()
           AND REFERENCED_TABLE_NAME IN ('course_history', 'course_schedule')))
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;

-- 以下是普通 SQL 语句，仅列作候选操作，不会自动执行。
-- 前提：已核对线上代码/任务/报表不再引用，且相关值或历史数据已完整保留。
-- 不要求同时删除所有候选项，可保持原样，不影响当前 dev 的正常运行。

-- A. 两个旧字段：当前 dev 分别使用 archived_at 和 effective_start_date。
-- ALTER TABLE `courses`
--   DROP COLUMN `status`,
--   DROP COLUMN `effective_from`;
-- 上面删除 status 时，数据库会自动移除它的单列 idx_courses_status 索引。

-- B. 两张旧表：只有确定无需保留其中任何数据时，才考虑删除。
-- 有历史记录的旧表应继续保留；当前 dev 的系统备份不包含这两张旧表。
-- 可先手动执行以下只读计数，但空表也不能据此断定线上代码不再使用：
-- SELECT COUNT(*) AS history_rows FROM `course_history`;
-- SELECT COUNT(*) AS schedule_rows FROM `course_schedule`;
-- DROP TABLE `course_schedule`;
-- DROP TABLE `course_history`;
