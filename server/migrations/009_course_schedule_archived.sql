-- 009: 为 course_schedule 增加 archived/superseded_at 列
-- 新模型: archived=0 = 当前生效; archived=1 = 历史快照（不删，保留作为事件流）

ALTER TABLE course_schedule
  ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0 AFTER hours_per_class,
  ADD COLUMN superseded_at DATE NULL AFTER archived,
  ADD INDEX idx_schedule_course_active (course_id, archived, effective_from);

-- course_history 表保留（历史遗留），新代码不再写入
