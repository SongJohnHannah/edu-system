/*
 Navicat Premium Data Transfer

 Source Server         : 阿里
 Source Server Type    : MySQL
 Source Server Version : 110806 (11.8.6-MariaDB-0+deb13u1 from Debian)
 Source Host           : 123.56.88.51:3306
 Source Schema         : edu_system

 Target Server Type    : MySQL
 Target Server Version : 110806 (11.8.6-MariaDB-0+deb13u1 from Debian)
 File Encoding         : 65001

 Date: 10/10/2026 11:04:22
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for courses
-- ----------------------------
DROP TABLE IF EXISTS `courses`;
CREATE TABLE `courses`  (
  `id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `weekday` tinyint NULL DEFAULT NULL,
  `start_time` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `end_time` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `classroom` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT '',
  `hours_per_class` decimal(4, 1) NULL DEFAULT 1.0,
  `student_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `created_at` datetime NULL DEFAULT current_timestamp,
  `updated_at` datetime NULL DEFAULT current_timestamp ON UPDATE CURRENT_TIMESTAMP,
  `is_test` tinyint(1) NULL DEFAULT 0,
  `effective_from` date NULL DEFAULT curdate,
  `status` enum('active','deleted') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'active',
  `archived_at` datetime NULL DEFAULT NULL,
  `effective_start_date` date NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_courses_teacher`(`teacher_id` ASC) USING BTREE,
  INDEX `idx_courses_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of courses
-- ----------------------------
INSERT INTO `courses` VALUES ('mocq76o305jj7kqad1w3', 'PU2 周一', 'moa3wk3nvvrfcnmejpn', 1, '18:30', '20:30', '', 2.0, '[\"mobdebdydkztl5kn8zi\",\"mobbk994zno1glw3d58\",\"mobbl00g7manyz94tbi\",\"mobatnpxdx5qev51d4\",\"mobc9cf8mbymrmbt5\",\"mobcak6hskux8xg7qy\",\"mul4ml151o3zlkqg4q1\",\"mula7zfu9da5tfqksyv\"]', '2026-04-24 17:46:25', '2026-09-28 21:27:36', 0, '2026-09-28', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocqhzvgyj22jdvsqxc', '主题英语启蒙', 'mobard67hrhybth7jlv', 3, '19:00', '20:00', '', 1.0, '[\"mobbeo33zmdu47xk81f\",\"mobbdp2lzyxbfbu3z6\",\"mobbr22786grec67dp\",\"mul4wvs02cnf05mox2\",\"mul4wvrys7l1lwcmxec\",\"mul4wvrzk5rz4yvlysl\",\"mul4wvs1jn9sge5uv3p\",\"muzcyfrvdlrnlnsqdyn\"]', '2026-04-24 17:54:49', '2026-10-10 10:15:24', 0, '2026-10-08', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocqk1ku383lvtkjdyi', '周五pu0', 'mul1fnu3msslpj5ispi', 5, '19:00', '21:00', '', 2.0, '[\"mobbsqe03guv62xkaoz\",\"mobbldtc4ses77cdxht\",\"mobbmr1g7w28bvqw4il\",\"mobbq0npu3wzammngga\",\"mobbrz0zf6uugfe7479\",\"mobaulc74dljslt9xaa\",\"mul50p91f5dtssnza0t\"]', '2026-04-24 17:56:25', '2026-10-09 18:39:29', 0, '2026-10-09', 'active', '2026-10-09 18:39:29', NULL);
INSERT INTO `courses` VALUES ('mocqnpqmxq3t3pa1m6q', 'pu0', 'moa3wk3nvvrfcnmejpn', 7, '16:00', '18:00', '', 2.0, '[\"mobcsnb4lklsvcgyil\",\"mobc3ytvjzd53akh5f7\",\"mobc57o43nipdcunm62\",\"mul5hl44f9g1wovxott\",\"mul5hl462gn6p4zqed\",\"mul5hl45vvtqn8jtupk\",\"mul5hl47symxwgf1yva\",\"mul5hl48aoidrnxiy1p\"]', '2026-04-24 17:59:16', '2026-10-10 10:14:46', 0, '2026-10-08', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocqr84vnzbilrl741', 'PU3  周四', 'moa3wk3nvvrfcnmejpn', 4, '18:30', '20:30', '', 2.0, '[\"mobcmf6sgsknthj03cu\",\"mobcnakfwal8at6r9nc\",\"mobcnv0rrf7vpjwttk9\",\"mul4vmfjjhoihn3t6l\",\"mul4vmfortsf3qvnrg\",\"mul4vmfkd4nhgo1skz5\",\"mul4vmfmbvfvi73bhrg\",\"mul4vmfpt2dne9x4pe8\"]', '2026-04-24 18:02:00', '2026-09-28 19:07:07', 0, '2026-09-28', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocqtvj0gm82a4e69e', 'PU 1 周六8-10', 'moa3wk3nvvrfcnmejpn', 6, '08:00', '10:00', '', 2.0, '[\"mobc7sw2s7aa52ztopi\",\"mobc9xghyxkfdm29pe\",\"mobcqeg1ktiwuyc34kb\",\"mobcwl9qucdhkpwvxa\",\"mobcxcokeb7qclpzg2\",\"mul52k4mkofaf20xyx8\"]', '2026-04-24 18:04:04', '2026-10-09 20:14:45', 0, '2026-09-28', 'active', '2026-10-09 20:14:45', NULL);
INSERT INTO `courses` VALUES ('mocqvqzj2ak81jooceb', 'unlock 2', 'moa3wk3nvvrfcnmejpn', 7, '18:00', '20:00', '', 2.0, '[\"mobctj4cu3wd4svg6xp\",\"mobbxv80kv5m7xrld6o\",\"mobbvnqxlbbdx76lb\",\"mobc5rl68onscw0mhyw\",\"mobc68tp7jiq3orygg3\"]', '2026-04-24 18:05:31', '2026-10-08 15:35:46', 0, '2026-10-08', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocqyh213linf4kqca6', 'PU 2 周六10-12', 'moa3wk3nvvrfcnmejpn', 6, '10:00', '12:00', '', 2.0, '[\"mobbjgbctukunax7wqm\",\"mobbtkys435ez5nxuu3\",\"mobd7yld03qqv3uoe3ao\",\"mobcoodt4a2huo1h9us\",\"mobd2ffkoqizu2d7py\",\"mul55xsgxhrfnfm94bs\"]', '2026-04-24 18:07:38', '2026-10-10 10:15:14', 0, '2026-09-28', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocr1snamvn5vkgjwo', 'PU2 周五', 'moa3wk3nvvrfcnmejpn', 5, '19:00', '21:00', '', 2.0, '[\"mobcclb0zpg61zopbq\",\"mobd9p3a5fdsnxes6ac\",\"mobdanc5hjjsvxzbieg\",\"muzjrcsa2vmaf94919c\"]', '2026-04-24 18:10:13', '2026-10-09 19:14:15', 0, '2026-10-08', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocr3r2y1zfzrupirew', 'PU 0 周三', 'moa3wk3nvvrfcnmejpn', 3, '18:30', '20:30', '', 2.0, '[\"mobbw5c8y9arucr18s9\",\"mobcdtkuhxqf9k76fpq\",\"mobd8f1bigxljlngc1\",\"mobc3b4g7ugtrhveii4\",\"mobc8gqvmpb7g2p7fkk\",\"mul4puh54s6zj8pcio\",\"mul4puh7oj1hmbpwp1\",\"mul4puh7qadhdv7btvn\",\"mul50p8tj0b7p5wm24\",\"mv0z7q57veaj8fn8sbg\"]', '2026-04-24 18:11:44', '2026-10-09 21:03:53', 0, '2026-10-09', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocr5ggbx9vqtt3u2bi', 'PU 4 周六4-6', 'moa3wk3nvvrfcnmejpn', 6, '16:00', '18:00', '', 2.0, '[\"mobc04gnhtmzufyfh9b\",\"mobdbmpc43hi1ginpul\",\"mul5agtyf4n3btpj7kv\",\"mul5agtzg64xojpweo8\"]', '2026-04-24 18:13:04', '2026-10-10 10:15:09', 0, '2026-09-28', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocratg4ie5udk83zt', 'PU 3 周六6-8', 'moa3wk3nvvrfcnmejpn', 6, '18:00', '20:00', '', 2.0, '[\"mobbpgmm7hkkiv8entf\",\"mobcb3g4lw1y1woog09\",\"mobcytjjxcz2kly6tbf\",\"mobd57gaxwddr7azmli\",\"mul5d1ufj944sqgmro7\",\"mul5d1ugl0757aj4v0b\"]', '2026-04-24 18:17:14', '2026-10-10 10:15:04', 0, '2026-09-28', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mocrcf7w7spredun13g', 'PU 3 周六2-4', 'moa3wk3nvvrfcnmejpn', 6, '14:00', '16:00', '', 2.0, '[\"mobd665pigark12ks3a\",\"mobchyrr49y6ceb1dbc\",\"mobd8x19y96th4o70h\",\"mobd1a3yjtj0n1l53xk\",\"mobd4bkguowx2s7bt0o\",\"mobd70rsgihvzye6std\",\"mobcrua2ljllzwe5jwb\",\"mobcdbsr1n60vkikree\",\"mobceip9jcmc38suuao\"]', '2026-04-24 18:18:29', '2026-10-08 17:46:52', 0, '2026-10-08', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mttmcu7xhsndrno2pd', '阿松老师1的课', 'mttmbandiu1agoinirs', 5, '10:00', '12:00', '', 2.0, '[\"mttmaouu57xc7g1o495\",\"mttmbargul0awpug7no\",\"mttmbarml5oa3tg29hm\",\"mttmbaru05bkftb2dcyj\",\"mttmbas24njwuy46ele\"]', '2026-07-09 12:49:27', '2026-09-11 09:45:25', 0, '2026-09-27', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('mul1l7026pa6xw4os46', 'PU2 周日 2-4', 'moa3wk3nvvrfcnmejpn', 7, '14:00', '16:00', '', 2.0, '[\"mobcbu630tsclvyxub6\",\"mobc71cqnc7vb1vubn\",\"mobc2d4778uvveqhgt3\",\"mobc1q4affp06vumoa\",\"mobcvxpqj95qtze7tc8\",\"mul5e85oosgegeseov\",\"mul5e85pxk9j4oc3q8c\",\"mul51g768cn6s8cm61n\"]', '2026-09-28 17:25:38', '2026-10-09 19:14:24', 0, '2026-09-28', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('muo2veopih9t0he71q', 'KB1 零基础', 'mul1fnu3msslpj5ispi', 6, '10:00', '12:00', '', 2.0, '[\"muo2zfshnm9yewabce\",\"muo2zfsii63hun9idh\",\"muo2zfsj72dt13qzix\",\"muo2zfsmspd1sti8xh\",\"muo2zfsia2hebtakweg\",\"muo2zfskb65ga5mx6jk\",\"muo2zfsndvzsl814lkf\",\"muo2zfsl0t5zq70j70pq\"]', '2026-09-30 20:24:53', '2026-09-30 20:28:11', 0, '2026-09-30', 'active', NULL, NULL);
INSERT INTO `courses` VALUES ('muz7xn3qcx0j0si9np', '测试测试课', 'mul1fnu3msslpj5ispi', 4, '18:30', '20:30', '', 2.0, '[\"mobctj4cu3wd4svg6xp\"]', '2026-10-08 15:32:03', '2026-10-08 15:33:29', 0, '2026-10-08', 'deleted', NULL, NULL);
INSERT INTO `courses` VALUES ('mv0u6f7sbd21borawym', '周五pu0', 'mul1fnu3msslpj5ispi', 5, '18:30', '20:30', '', 2.0, '[\"muo2zfsl0t5zq70j70pq\",\"mul50p91f5dtssnza0t\",\"mobbsqe03guv62xkaoz\",\"mobbq0npu3wzammngga\",\"mobbmr1g7w28bvqw4il\",\"mobaulc74dljslt9xaa\"]', '2026-10-09 18:42:30', '2026-10-09 19:08:15', 0, '2026-10-09', 'active', '2026-10-09 19:08:15', '2026-10-16');
INSERT INTO `courses` VALUES ('mv0v51evqy9zi0awyo', '周五pu0', 'mul1fnu3msslpj5ispi', 5, '18:30', '20:30', '', 2.0, '[\"muo2zfsl0t5zq70j70pq\",\"mul50p91f5dtssnza0t\",\"mobbsqe03guv62xkaoz\",\"mobbq0npu3wzammngga\",\"mobbmr1g7w28bvqw4il\",\"mobaulc74dljslt9xaa\",\"mv0xvj3uwv3kbew17vd\"]', '2026-10-09 19:09:25', '2026-10-09 20:26:13', 0, '2026-10-09', 'active', NULL, '2026-10-16');
INSERT INTO `courses` VALUES ('mv0xjow2ru85yvmwph', '周六8-10', 'moa3wk3nvvrfcnmejpn', 6, '08:00', '10:00', '', 2.0, '[\"mul52k4mkofaf20xyx8\",\"mul55xsgxhrfnfm94bs\",\"mobc7sw2s7aa52ztopi\",\"mobcqeg1ktiwuyc34kb\",\"mobc9xghyxkfdm29pe\"]', '2026-10-09 20:16:48', '2026-10-09 20:16:48', 0, '2026-10-09', 'active', NULL, '2026-10-10');
INSERT INTO `courses` VALUES ('mv0xl2kyhdfi6qpeilb', '子怡子硕', 'mul1fnu3msslpj5ispi', 6, '08:00', '10:00', '', 2.0, '[\"muo0wi69yra2dco8r3i\",\"muo0wi6ae2eho2xurxq\"]', '2026-10-09 20:17:52', '2026-10-09 20:17:52', 0, '2026-10-09', 'active', NULL, '2026-10-10');

SET FOREIGN_KEY_CHECKS = 1;
