-- Migration 023: Fix scope_sets unique constraint
--
-- 原约束 (course_id, name) 会让同一课程下不同用户的默认集合互相碰撞：
-- 当 User B 对已有 (course_id, "All Files") 做 upsert 时，
-- 会把该行的 user_id 覆盖成 User B，导致 User A 丢失默认集合。
--
-- 修复：将约束改为 (course_id, user_id, name)，每个用户在同一课程下
-- 可以独立维护自己的 scope set 命名空间。

-- 删除旧约束（名称可能因建表方式不同而异，均尝试删除）
ALTER TABLE scope_sets DROP CONSTRAINT IF EXISTS scope_sets_course_id_name_key;
ALTER TABLE scope_sets DROP CONSTRAINT IF EXISTS uq_scope_sets_course_name;

-- 新约束：课程 + 用户 + 名称 三元组唯一
ALTER TABLE scope_sets
    ADD CONSTRAINT uq_scope_sets_course_user_name
    UNIQUE (course_id, user_id, name);
