-- 手动减课时已记录为 subtract；保留 add/deduct/restore 旧值及历史数据。
ALTER TABLE hour_records
  MODIFY COLUMN type ENUM('add', 'subtract', 'deduct', 'restore') NOT NULL;
