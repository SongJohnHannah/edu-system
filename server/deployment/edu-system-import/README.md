# 本地教务数据分段导入

来源为用户提供的 `server/deployment/edu_system.sql`，目标是当前 `dev` 项目使用的 MariaDB 11.8.6 数据库。

按文件名前缀 01～16 顺序执行，每段包含建表和本表数据，数据写入使用独立事务。执行前在数据库客户端选中空的 `edu_system` 库。本目录不含清空、覆盖或更新已有记录的语句，重复插入已有主键会报错，应停止并核对。

| 顺序 | 表 | 记录数 |
| --- | --- | ---: |
| 01 | settings | 0 |
| 02 | classes | 0 |
| 03 | teachers | 5 |
| 04 | users | 6 |
| 05 | students | 138 |
| 06 | courses | 21 |
| 07 | course_schedule_versions | 0 |
| 08 | course_roster_versions | 20 |
| 09 | course_detail_versions | 0 |
| 10 | course_occurrence_changes | 1 |
| 11 | trial_bookings | 1 |
| 12 | attendance | 4 |
| 13 | attendance_reversals | 1 |
| 14 | hour_records | 413 |
| 15 | course_handovers | 16 |
| 16 | course_substitutions | 0 |

合计 16 张表、626 条记录。即使没有记录，新版功能所需表也保留。

当前前后端代码与备份清单不读取旧表 `course_history`、`course_schedule`，本次不导入。旧课程字段 `courses.status`、`courses.effective_from` 及其旧索引不导入；对应功能使用 `courses.archived_at` 和 `courses.effective_start_date`。教师、学生、试听、代课表的 `status` 仍在使用，不能一并删除。`is_test`、学生 `class_id`、点名 `recorded_by` 等字段也保留。

原 SQL 中课程表的 `DEFAULT curdate` 在 MariaDB 上会报 `Unknown column 'curdate' in 'DEFAULT'`，导致课程表创建失败。本目录通过去掉不再使用的旧日期字段消除了此错误，并为 INSERT 显式指定列名，避免字段位置变化导致错位。

原 SQL 中 124 条历史课时流水关联的学生已不在该 SQL 的学生表中。本次按原样保留这些流水，没有删除流水、补造学生或调整学生课时余额。

原始 SQL 保留作为来源快照。请使用本目录的分段文件；原始 SQL 含 DROP TABLE，不适合对已有业务库直接重复执行。上述结论适用于当前本地 dev，其他部署版本需单独核对。
