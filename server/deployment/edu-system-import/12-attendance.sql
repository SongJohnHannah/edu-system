-- 12. attendance：4 条记录
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `attendance`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `course_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `student_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `hours_deducted` decimal(4, 1) NULL DEFAULT 1.0,
  `created_at` datetime NULL DEFAULT current_timestamp,
  `recorded_by` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `is_test` tinyint(1) NULL DEFAULT 0,
  `voided_at` datetime NULL DEFAULT NULL,
  `course_name_snapshot` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `teacher_name_snapshot` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `student_names_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `original_student_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `original_date` date NULL DEFAULT NULL,
  `start_time_snapshot` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `end_time_snapshot` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `teaching_teacher_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_attendance_course`(`course_id` ASC) USING BTREE,
  INDEX `idx_attendance_date`(`date` ASC) USING BTREE,
  INDEX `idx_attendance_recorded_by`(`recorded_by` ASC) USING BTREE,
  INDEX `idx_attendance_occurrence`(`course_id` ASC, `date` ASC, `original_date` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;
START TRANSACTION;
INSERT INTO `attendance` (`id`, `course_id`, `date`, `student_ids`, `hours_deducted`, `created_at`, `recorded_by`, `is_test`, `voided_at`, `course_name_snapshot`, `teacher_name_snapshot`, `student_names_snapshot`, `original_student_ids`, `original_date`, `start_time_snapshot`, `end_time_snapshot`, `teaching_teacher_id`) VALUES ('muz7z357doyxxno02gv', 'muz7xn3qcx0j0si9np', '2026-10-08', '[]', 2.0, '2026-10-08 15:33:10', NULL, 0, '2026-10-09 19:35:47', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO `attendance` (`id`, `course_id`, `date`, `student_ids`, `hours_deducted`, `created_at`, `recorded_by`, `is_test`, `voided_at`, `course_name_snapshot`, `teacher_name_snapshot`, `student_names_snapshot`, `original_student_ids`, `original_date`, `start_time_snapshot`, `end_time_snapshot`, `teaching_teacher_id`) VALUES ('muzf0vlsxsdgdd8hue', 'mocqr84vnzbilrl741', '2026-10-08', '[\"mobcmf6sgsknthj03cu\",\"mobcnakfwal8at6r9nc\",\"mobcnv0rrf7vpjwttk9\",\"mul4vmfjjhoihn3t6l\",\"mul4vmfortsf3qvnrg\",\"mul4vmfkd4nhgo1skz5\",\"mul4vmfmbvfvi73bhrg\",\"mul4vmfpt2dne9x4pe8\"]', 2.0, '2026-10-08 18:50:31', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO `attendance` (`id`, `course_id`, `date`, `student_ids`, `hours_deducted`, `created_at`, `recorded_by`, `is_test`, `voided_at`, `course_name_snapshot`, `teacher_name_snapshot`, `student_names_snapshot`, `original_student_ids`, `original_date`, `start_time_snapshot`, `end_time_snapshot`, `teaching_teacher_id`) VALUES ('mv0uy1r9q1njiw9gms', 'mv0u6f7sbd21borawym', '2026-10-09', '[\"muo2zfsl0t5zq70j70pq\",\"mul50p91f5dtssnza0t\",\"mobbsqe03guv62xkaoz\",\"mobbq0npu3wzammngga\",\"mobbmr1g7w28bvqw4il\",\"mobaulc74dljslt9xaa\"]', 2.0, '2026-10-09 19:03:59', NULL, 0, NULL, '周五pu0', 'Sally', '{\"mobaulc74dljslt9xaa\":\"程意成\",\"mobbmr1g7w28bvqw4il\":\"李明芮\",\"mobbq0npu3wzammngga\":\"李增润\",\"mobbsqe03guv62xkaoz\":\"李易彤\",\"mul50p91f5dtssnza0t\":\"李昀璟\",\"muo2zfsl0t5zq70j70pq\":\"赵俊熙\"}', '[\"muo2zfsl0t5zq70j70pq\",\"mul50p91f5dtssnza0t\",\"mobbsqe03guv62xkaoz\",\"mobbq0npu3wzammngga\",\"mobbmr1g7w28bvqw4il\",\"mobaulc74dljslt9xaa\"]', '2026-10-16', '20:00', '22:00', 'mul1fnu3msslpj5ispi');
INSERT INTO `attendance` (`id`, `course_id`, `date`, `student_ids`, `hours_deducted`, `created_at`, `recorded_by`, `is_test`, `voided_at`, `course_name_snapshot`, `teacher_name_snapshot`, `student_names_snapshot`, `original_student_ids`, `original_date`, `start_time_snapshot`, `end_time_snapshot`, `teaching_teacher_id`) VALUES ('mv0vdd7n0lxtys6cp1uq', 'mocr1snamvn5vkgjwo', '2026-10-09', '[\"mobcclb0zpg61zopbq\",\"mobd9p3a5fdsnxes6ac\",\"mobdanc5hjjsvxzbieg\",\"muzjrcsa2vmaf94919c\"]', 2.0, '2026-10-09 19:15:54', NULL, 0, NULL, 'PU2 周五', 'Grace', '{\"mobcclb0zpg61zopbq\":\"水水Emma\",\"mobd9p3a5fdsnxes6ac\":\"彭尚贤\",\"mobdanc5hjjsvxzbieg\":\"郑耘沐函Amy\",\"muzjrcsa2vmaf94919c\":\"姚政沅\"}', '[\"mobcclb0zpg61zopbq\",\"mobd9p3a5fdsnxes6ac\",\"mobdanc5hjjsvxzbieg\",\"muzjrcsa2vmaf94919c\"]', '2026-10-09', '19:00', '21:00', 'moa3wk3nvvrfcnmejpn');
COMMIT;
