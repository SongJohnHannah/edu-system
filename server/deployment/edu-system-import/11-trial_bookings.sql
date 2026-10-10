-- 11. trial_bookings：1 条记录
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `trial_bookings`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `course_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `occurrence_date` date NULL DEFAULT NULL,
  `booking_date` date NOT NULL,
  `start_time` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `end_time` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` enum('active','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `course_name_snapshot` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `teacher_name_snapshot` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_name_snapshot` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_test` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NULL DEFAULT current_timestamp,
  `updated_at` datetime NULL DEFAULT current_timestamp ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_trial_date`(`booking_date` ASC, `status` ASC) USING BTREE,
  INDEX `idx_trial_teacher`(`teacher_id` ASC, `booking_date` ASC) USING BTREE,
  INDEX `idx_trial_student`(`student_id` ASC, `booking_date` ASC) USING BTREE,
  INDEX `idx_trial_course`(`course_id` ASC, `occurrence_date` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;
START TRANSACTION;
INSERT INTO `trial_bookings` (`id`, `student_id`, `teacher_id`, `course_id`, `occurrence_date`, `booking_date`, `start_time`, `end_time`, `note`, `status`, `course_name_snapshot`, `teacher_name_snapshot`, `student_name_snapshot`, `is_test`, `created_at`, `updated_at`) VALUES ('mv0vujs0sfuvxh38gpc', 'mtluf2m7mwggz00d5he', 'mttmbandiu1agoinirs', 'mttmcu7xhsndrno2pd', '2026-10-16', '2026-10-16', '10:00', '12:00', '', 'cancelled', '阿松老师1的课', '阿松老师一', '阿松的学生002', 0, '2026-10-09 19:29:15', '2026-10-09 19:31:12');
COMMIT;
