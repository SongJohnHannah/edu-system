-- 嘉言思听教务系统 - MySQL 初始化 Schema

CREATE DATABASE IF NOT EXISTS edu_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE edu_system;

-- 用户表（登录认证）
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'teacher') NOT NULL DEFAULT 'teacher',
  teacher_id VARCHAR(32) DEFAULT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_login DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 学生表
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) DEFAULT '',
  age INT,
  remark TEXT,
  total_hours INT DEFAULT 0,
  used_hours INT DEFAULT 0,
  status ENUM('active', 'quit', 'deleted') DEFAULT 'active',
  class_id VARCHAR(32) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_name (name),
  INDEX idx_students_status (status),
  INDEX idx_students_class (class_id)
);

-- 教师表
CREATE TABLE IF NOT EXISTS teachers (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) DEFAULT '',
  subject VARCHAR(100) DEFAULT '',
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 课程表
CREATE TABLE IF NOT EXISTS courses (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  teacher_id VARCHAR(32) NOT NULL,
  weekday TINYINT,
  start_time VARCHAR(10),
  end_time VARCHAR(10),
  classroom VARCHAR(100) DEFAULT '',
  hours_per_class INT DEFAULT 1,
  student_ids JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_courses_teacher (teacher_id)
);

-- 点名记录表
CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(32) PRIMARY KEY,
  course_id VARCHAR(32) NOT NULL,
  date DATE NOT NULL,
  student_ids JSON,
  hours_deducted INT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_course (course_id),
  INDEX idx_attendance_date (date)
);

-- 课时记录表
CREATE TABLE IF NOT EXISTS hour_records (
  id VARCHAR(32) PRIMARY KEY,
  student_id VARCHAR(32) NOT NULL,
  type ENUM('add', 'deduct', 'restore') NOT NULL,
  hours INT NOT NULL,
  remark TEXT,
  related_id VARCHAR(32) DEFAULT NULL,
  operator VARCHAR(50) DEFAULT 'manual',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hour_records_student (student_id)
);

-- 班级表
CREATE TABLE IF NOT EXISTS classes (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT
);
