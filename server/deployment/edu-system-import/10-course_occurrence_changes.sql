-- 10. course_occurrence_changes：1 条记录
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `course_occurrence_changes`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `course_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_date` date NOT NULL,
  `target_date` date NOT NULL,
  `start_time` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `end_time` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NULL DEFAULT current_timestamp,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uq_occurrence_change`(`course_id` ASC, `original_date` ASC) USING BTREE,
  INDEX `idx_occurrence_target`(`target_date` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;
START TRANSACTION;
INSERT INTO `course_occurrence_changes` (`id`, `course_id`, `original_date`, `target_date`, `start_time`, `end_time`, `created_at`) VALUES ('mv0uxglva1mjuq04bzi', 'mv0u6f7sbd21borawym', '2026-10-16', '2026-10-09', '20:00', '22:00', '2026-10-09 19:03:32');
COMMIT;
