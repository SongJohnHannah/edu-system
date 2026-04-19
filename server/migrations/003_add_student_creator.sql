-- 为学生表添加创建者追踪字段
-- 用于区分管理员添加的公共学生和教师添加的私有学生

ALTER TABLE students ADD COLUMN created_by ENUM('admin', 'teacher') NOT NULL DEFAULT 'admin';
ALTER TABLE students ADD COLUMN creator_id VARCHAR(32) DEFAULT NULL;

CREATE INDEX idx_students_creator ON students(creator_id);

-- 现有学生默认设为管理员创建（保持向后兼容）
-- 管理员创建的学生：任何老师可选，被选入班级后其他老师不能再选
-- 老师创建的学生：只有该老师和管理员能看到
