-- 请在待升级的 edu_system 数据库中执行一次。
-- 入学日期可独立修改或清空；历史学生保持未填写，不推断其入学时间。
ALTER TABLE students ADD COLUMN enrollment_date DATE NULL;
