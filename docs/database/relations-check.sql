-- ===========================================================================
-- EduHub — how the tables relate, and queries to check it yourself
--
-- Run docs/database/schema.sql first (on an empty DB), then run this file
-- section by section in psql / pgAdmin / DBeaver.
-- Section 3 inserts demo data inside a transaction and ROLLS BACK at the
-- end, so nothing is left behind.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. RELATIONSHIP MAP
-- ---------------------------------------------------------------------------
--
--                     ┌────────────────────┐
--                     │       users        │
--                     └────────────────────┘
--        1 : 1 │      1 : N │      1 : N │         1 : N │        0..1 : N │
--              ▼            ▼            ▼               ▼                 ▼
--   user_profiles   refresh_tokens   email_tokens   institution_     institutions
--   (PK = user_id)                                  memberships      (created_by_user_id)
--                                                        ▲ N : 1             │
--                                                        └───────────────────┤
--                                                                     1 : N  │
--                                                  institution_external_ids ◄┤
--                                                  institution_media        ◄┘
--
--  users  ◄── N : M ──►  institutions      (through institution_memberships,
--                                           each row carries a role + status)
--
--  audit_logs: NO foreign keys on purpose. actor_user_id / target_id /
--  institution_id are plain UUIDs so the log survives if the user or
--  institution is deleted. It is append-only (a trigger blocks UPDATE/DELETE).
--
-- Foreign keys and what happens on delete:
--
--  child table                column               → parent         ON DELETE
--  -------------------------  -------------------  ---------------  ---------
--  user_profiles              user_id              → users.id       CASCADE
--  refresh_tokens             user_id              → users.id       CASCADE
--  email_tokens               user_id              → users.id       CASCADE
--  institution_memberships    user_id              → users.id       CASCADE
--  institution_memberships    institution_id       → institutions   CASCADE
--  institution_memberships    created_by_user_id   → users.id       SET NULL
--  institutions               created_by_user_id   → users.id       SET NULL
--  institution_external_ids   institution_id       → institutions   CASCADE
--  institution_media          institution_id       → institutions   CASCADE
--
-- Uniqueness rules (partial indexes — only count "live" rows):
--  users.email               unique WHERE deleted_at IS NULL
--  institutions.slug         unique WHERE deleted_at IS NULL
--  memberships (user, institution, role)          unique WHERE left_at IS NULL
--  memberships (institution, institution_member_id) unique WHERE active + not null
--  institution_external_ids (source, external_id) unique
--  refresh_tokens.token_hash, email_tokens.token_hash unique


-- ---------------------------------------------------------------------------
-- 2. INSPECT THE REAL SCHEMA (reads the catalog, so it's always accurate)
-- ---------------------------------------------------------------------------

-- 2a. Every foreign key, with its delete rule
SELECT
  tc.table_name                AS child_table,
  kcu.column_name              AS child_column,
  ccu.table_name               AS parent_table,
  ccu.column_name              AS parent_column,
  rc.delete_rule               AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY child_table, child_column;

-- 2b. Every CHECK constraint
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS rule
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

-- 2c. Every unique index (including the partial ones)
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND indexdef ILIKE '%UNIQUE%'
ORDER BY tablename;

-- 2d. Enum values
SELECT t.typname AS enum, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
GROUP BY t.typname ORDER BY 1;


-- ---------------------------------------------------------------------------
-- 3. HANDS-ON: insert demo data and watch the relations work
--    (everything is rolled back at the end)
-- ---------------------------------------------------------------------------
BEGIN;

-- Users (updated_at has no DB default — Prisma sets it — so we pass now())
INSERT INTO users (id, email, full_name, status, platform_role, updated_at) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@demo.test',   'Asha Admin',   'ACTIVE', 'SUPER_ADMIN', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'teacher@demo.test', 'Tara Teacher', 'ACTIVE', 'USER',        now()),
  ('00000000-0000-0000-0000-0000000000c1', 'student@demo.test', 'Sam Student',  'ACTIVE', 'USER',        now());

-- 1:1 profile
INSERT INTO user_profiles (user_id, headline, visibility, updated_at) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'Maths teacher', 'PUBLIC', now());

-- Institution created by the admin
INSERT INTO institutions (id, slug, name, category, country_code, status, created_by_user_id, updated_at) VALUES
  ('00000000-0000-0000-0000-00000000aa01', 'green-valley-school', 'Green Valley School',
   'SCHOOL', 'IN', 'PUBLISHED', '00000000-0000-0000-0000-0000000000a1', now());

-- 1:N children of the institution
INSERT INTO institution_media (id, institution_id, url, updated_at) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000aa01', 'https://example.com/a.jpg', now());
INSERT INTO institution_external_ids (id, institution_id, source, external_id, updated_at) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000aa01', 'GOV_DATASET', 'UDISE-123', now());

-- N:M users <-> institutions through memberships
INSERT INTO institution_memberships (id, user_id, institution_id, role, status, institution_member_id, joined_at, updated_at) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000aa01', 'TEACHER', 'ACTIVE', 'T-01', now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aa01', 'STUDENT', 'ACTIVE', 'S-01', now(), now()),
  -- same person can hold a DIFFERENT role at the same school
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000aa01', 'STAFF',   'ACTIVE', NULL,   now(), now());

-- 3a. Who belongs to which institution, in what role
SELECT i.name AS institution, u.full_name, m.role, m.status, m.institution_member_id
FROM institution_memberships m
JOIN users u        ON u.id = m.user_id
JOIN institutions i ON i.id = m.institution_id
ORDER BY u.full_name, m.role;

-- 3b. Institution with its creator and child-row counts
SELECT i.name, creator.full_name AS created_by,
       (SELECT count(*) FROM institution_media        WHERE institution_id = i.id) AS media,
       (SELECT count(*) FROM institution_external_ids WHERE institution_id = i.id) AS external_ids,
       (SELECT count(*) FROM institution_memberships  WHERE institution_id = i.id) AS members
FROM institutions i
LEFT JOIN users creator ON creator.id = i.created_by_user_id;

-- 3c. User with optional profile (LEFT JOIN because profile is 0..1)
SELECT u.full_name, p.headline, p.visibility
FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
ORDER BY u.full_name;

-- 3d. Constraints in action. Each SAVEPOINT lets the transaction continue
--     after the expected error. Uncomment one block at a time to see it fail.

-- Duplicate role at the same school  -> unique violation (memberships_user_institution_role_active)
-- SAVEPOINT s1;
-- INSERT INTO institution_memberships (id, user_id, institution_id, role, updated_at)
--   VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aa01', 'STUDENT', now());
-- ROLLBACK TO s1;

-- Uppercase email -> CHECK violation (users_email_lowercase_chk)
-- SAVEPOINT s2;
-- INSERT INTO users (id, email, full_name, updated_at) VALUES (gen_random_uuid(), 'Bad@Demo.test', 'X', now());
-- ROLLBACK TO s2;

-- Membership pointing at a non-existent user -> FK violation
-- SAVEPOINT s3;
-- INSERT INTO institution_memberships (id, user_id, institution_id, role, updated_at)
--   VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-00000000aa01', 'STUDENT', now());
-- ROLLBACK TO s3;

-- 3e. ON DELETE behaviour
-- Delete the ADMIN: institution survives, created_by_user_id becomes NULL (SET NULL)
DELETE FROM users WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT name, created_by_user_id FROM institutions;  -- created_by_user_id is NULL now

-- Delete the TEACHER: their profile + memberships disappear too (CASCADE)
DELETE FROM users WHERE id = '00000000-0000-0000-0000-0000000000b1';
SELECT count(*) AS teacher_profiles   FROM user_profiles           WHERE user_id = '00000000-0000-0000-0000-0000000000b1';  -- 0
SELECT count(*) AS teacher_membership FROM institution_memberships WHERE user_id = '00000000-0000-0000-0000-0000000000b1';  -- 0

-- Delete the INSTITUTION: media, external ids and remaining memberships go with it (CASCADE)
DELETE FROM institutions WHERE id = '00000000-0000-0000-0000-00000000aa01';
SELECT
  (SELECT count(*) FROM institution_media)        AS media_left,        -- 0
  (SELECT count(*) FROM institution_external_ids) AS external_ids_left, -- 0
  (SELECT count(*) FROM institution_memberships)  AS memberships_left;  -- 0

-- Audit log is append-only: the INSERT works, the UPDATE raises
-- "audit_logs is append-only: UPDATE is not allowed"
-- INSERT INTO audit_logs (id, action, target_type) VALUES (gen_random_uuid(), 'test.action', 'USER');
-- UPDATE audit_logs SET action = 'changed';

ROLLBACK;  -- undo all demo data
