-- 13. attendance_reversals：1 条记录
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `attendance_reversals`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `attendance_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `hours` decimal(8, 1) NOT NULL,
  `created_at` datetime NULL DEFAULT current_timestamp,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_attendance_reversal`(`attendance_id` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;
START TRANSACTION;
INSERT INTO `attendance_reversals` (`id`, `attendance_id`, `student_id`, `hours`, `created_at`) VALUES ('mv0w2xzgpniq9zbs1hq', 'muz7z357doyxxno02gv', 'mobctj4cu3wd4svg6xp', 2.0, '2026-10-09 19:35:47');
COMMIT;
