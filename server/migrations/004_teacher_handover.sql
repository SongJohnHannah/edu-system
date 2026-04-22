-- 004: 教师交接功能 - attendance 添加 recorded_by，创建交接记录表

-- 1. attendance 添加 recorded_by 列（记录谁创建的点名）
ALTER TABLE attendance ADD COLUMN recorded_by VARCHAR(32) DEFAULT NULL;
CREATE INDEX idx_attendance_recorded_by ON attendance(recorded_by);

-- 2. 回填：用课程的当前 teacher_id 填充已有记录
UPDATE attendance a JOIN courses c ON a.course_id = c.id
SET a.recorded_by = c.teacher_id WHERE a.recorded_by IS NULL;

-- 3. 创建交接记录表（冗余存储名称，防止教师删除后丢失历史信息）
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
