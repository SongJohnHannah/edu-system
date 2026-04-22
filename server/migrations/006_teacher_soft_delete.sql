-- 教师软删除：添加 status 列
ALTER TABLE teachers ADD COLUMN status ENUM('active', 'deleted') DEFAULT 'active';
CREATE INDEX idx_teachers_status ON teachers(status);
