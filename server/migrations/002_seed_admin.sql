-- 种子数据：默认管理员账户
-- 用户名: admin  密码: admin123
-- bcrypt hash of 'admin123' with cost factor 10
INSERT IGNORE INTO users (id, username, password_hash, role, display_name)
VALUES ('admin001', 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', '系统管理员');
