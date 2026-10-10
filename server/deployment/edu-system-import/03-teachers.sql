-- 3. teachers：5 条记录
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `teachers`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '',
  `subject` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime NULL DEFAULT current_timestamp,
  `updated_at` datetime NULL DEFAULT current_timestamp ON UPDATE CURRENT_TIMESTAMP,
  `is_test` tinyint(1) NULL DEFAULT 0,
  `status` enum('active','deleted') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_teachers_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;
START TRANSACTION;
INSERT INTO `teachers` (`id`, `name`, `phone`, `subject`, `remark`, `created_at`, `updated_at`, `is_test`, `status`) VALUES ('moa3wk3nvvrfcnmejpn', 'Grace', '13253730561', '', '', '2026-04-22 21:46:45', '2026-05-07 12:36:39', 0, 'active');
INSERT INTO `teachers` (`id`, `name`, `phone`, `subject`, `remark`, `created_at`, `updated_at`, `is_test`, `status`) VALUES ('mobard67hrhybth7jlv', 'Rosie', '17596502949', '小龄英语', '', '2026-04-23 17:46:27', '2026-04-23 17:46:27', 0, 'active');
INSERT INTO `teachers` (`id`, `name`, `phone`, `subject`, `remark`, `created_at`, `updated_at`, `is_test`, `status`) VALUES ('mtluby65g7uqnyv83i9', '阿松老师', '15013011022', '', '', '2026-09-04 02:10:33', '2026-10-10 10:18:08', 0, 'deleted');
INSERT INTO `teachers` (`id`, `name`, `phone`, `subject`, `remark`, `created_at`, `updated_at`, `is_test`, `status`) VALUES ('mttmbandiu1agoinirs', '阿松老师一', '13911295522', '', '', '2026-09-09 12:48:15', '2026-09-09 12:48:15', 0, 'active');
INSERT INTO `teachers` (`id`, `name`, `phone`, `subject`, `remark`, `created_at`, `updated_at`, `is_test`, `status`) VALUES ('mul1fnu3msslpj5ispi', 'Sally', '', '', '', '2026-09-28 17:21:20', '2026-09-28 17:21:20', 0, 'active');
COMMIT;
