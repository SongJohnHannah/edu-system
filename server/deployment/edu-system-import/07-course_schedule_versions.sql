-- 7. course_schedule_versions：0 条记录
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `course_schedule_versions`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `course_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `effective_week_start` date NOT NULL,
  `weekday` tinyint NOT NULL,
  `start_time` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `end_time` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NULL DEFAULT current_timestamp,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uq_schedule_version`(`course_id` ASC, `effective_week_start` ASC) USING BTREE,
  INDEX `idx_schedule_course`(`course_id` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;
START TRANSACTION;
COMMIT;
