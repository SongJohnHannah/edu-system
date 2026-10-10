-- 4. users：6 条记录
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `users`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','teacher') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'teacher',
  `teacher_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `display_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NULL DEFAULT 1,
  `last_login` datetime NULL DEFAULT NULL,
  `created_at` datetime NULL DEFAULT current_timestamp,
  `updated_at` datetime NULL DEFAULT current_timestamp ON UPDATE CURRENT_TIMESTAMP,
  `is_test` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;
START TRANSACTION;
INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `teacher_id`, `display_name`, `is_active`, `last_login`, `created_at`, `updated_at`, `is_test`) VALUES ('admin001', 'admin', '$2a$10$uNVPCbsjtrXQHH/mtaXRPuCRTil6z6Q9dksD5Zb8vDQa8caAVej22', 'admin', NULL, '系统管理员', 1, '2026-10-10 10:24:18', '2026-04-17 16:41:09', '2026-10-10 10:24:18', 0);
INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `teacher_id`, `display_name`, `is_active`, `last_login`, `created_at`, `updated_at`, `is_test`) VALUES ('moa3wk7usomd4jx61y', '13253730561', '$2a$10$shQrRtzTwuqZ8tEGrxWOweeBBJdEGTLa3pZK4vbI1EUXG.XC3RYOW', 'teacher', 'moa3wk3nvvrfcnmejpn', 'Grace', 1, '2026-07-31 16:49:15', '2026-04-22 21:46:46', '2026-07-31 16:49:15', 0);
INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `teacher_id`, `display_name`, `is_active`, `last_login`, `created_at`, `updated_at`, `is_test`) VALUES ('mobard94cng0dd9u1m9', '17596502949', '$2a$10$h1bchkzeRmO32fherylqi.vsZw.3KFbXBj7l3XYLkFqikBq//Xj9K', 'teacher', 'mobard67hrhybth7jlv', 'Rosie', 1, NULL, '2026-04-23 17:46:27', '2026-04-23 17:46:27', 0);
INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `teacher_id`, `display_name`, `is_active`, `last_login`, `created_at`, `updated_at`, `is_test`) VALUES ('mtluby68fsykfm6lshg', '15013011022', '$2a$10$V3hmApkT5v.2i640hU9tAeHwCLRNT85I6HOuE773NRwYpHk9x5clC', 'teacher', 'mtluby65g7uqnyv83i9', '阿松老师', 0, NULL, '2026-09-04 02:10:33', '2026-10-10 10:18:08', 0);
INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `teacher_id`, `display_name`, `is_active`, `last_login`, `created_at`, `updated_at`, `is_test`) VALUES ('mttmbandyncj2rnqrn', '13911295522', '$2a$10$JTphdick9nBfdKfyUpUYMOad2qSoxEdxfHGn/L/lZuW/i2ItdD9ou', 'teacher', 'mttmbandiu1agoinirs', '阿松老师一', 1, NULL, '2026-09-09 12:48:15', '2026-09-09 12:48:15', 0);
INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `teacher_id`, `display_name`, `is_active`, `last_login`, `created_at`, `updated_at`, `is_test`) VALUES ('mul1fnu3x31xsfii5t', 'teacher_mul1fnu3msslpj5ispi', '$2a$10$9yE76.KlsVqRNfZlgN/sneLyMFzeCWV4t1lLxzZIkqU/pGKGDDsIW', 'teacher', 'mul1fnu3msslpj5ispi', 'Sally', 1, NULL, '2026-09-28 17:21:20', '2026-09-28 17:21:20', 0);
COMMIT;
