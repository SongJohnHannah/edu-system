-- 9. course_detail_versions：0 条记录
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `course_detail_versions`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `course_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `effective_at` datetime(3) NOT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `classroom` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `hours_per_class` decimal(8, 1) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_detail_course`(`course_id` ASC, `effective_at` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;
START TRANSACTION;
COMMIT;
