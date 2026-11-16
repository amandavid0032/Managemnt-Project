-- ===========================================================================
-- EduHub — full database schema (PostgreSQL)
--
-- This file is ALL Prisma migrations from api/prisma/migrations, joined in
-- the order `prisma migrate deploy` runs them. Running it on an EMPTY
-- database gives exactly the same tables, enums, indexes, foreign keys,
-- CHECK constraints and triggers the app uses.
--
--   createdb eduhub_check
--   psql -d eduhub_check -f docs/database/schema.sql
--
-- Generated from migrations — do not edit by hand; regenerate instead.
-- See docs/database/relations-check.sql for the relationship map and
-- queries to see how everything links together.
-- ===========================================================================


-- ###########################################################################
-- MIGRATION: 20260908163816_init_phase1_foundation
-- ###########################################################################

-- CreateEnum
CREATE TYPE "InstitutionCategory" AS ENUM ('SCHOOL', 'COLLEGE', 'UNIVERSITY', 'POLYTECHNIC', 'INSTITUTE', 'TRAINING_CENTER', 'COACHING_CENTER', 'OTHER');

-- CreateEnum
CREATE TYPE "InstitutionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'SEED', 'INSTITUTION_SUBMITTED', 'GOOGLE_PLACES', 'GOV_DATASET');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'PLATFORM_ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('STUDENT', 'TEACHER', 'STAFF', 'INSTITUTION_ADMIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT,
    "full_name" VARCHAR(200) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "platform_role" "PlatformRole" NOT NULL DEFAULT 'USER',
    "email_verified_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "user_agent" VARCHAR(512),
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "legal_name" VARCHAR(300),
    "category" "InstitutionCategory" NOT NULL,
    "type_label" VARCHAR(120),
    "description" TEXT,
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "website" VARCHAR(500),
    "address_line1" VARCHAR(300),
    "address_line2" VARCHAR(300),
    "city" VARCHAR(150),
    "state" VARCHAR(150),
    "postal_code" VARCHAR(30),
    "country_code" CHAR(2) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "InstitutionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "source_updated_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_external_ids" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "source" "DataSource" NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "institution_external_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "institution_member_id" VARCHAR(100),
    "joined_at" TIMESTAMPTZ(3),
    "left_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "institution_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "institutions_category_country_code_idx" ON "institutions"("category", "country_code");

-- CreateIndex
CREATE INDEX "institutions_country_code_state_city_idx" ON "institutions"("country_code", "state", "city");

-- CreateIndex
CREATE INDEX "institutions_status_idx" ON "institutions"("status");

-- CreateIndex
CREATE INDEX "institutions_deleted_at_idx" ON "institutions"("deleted_at");

-- CreateIndex
CREATE INDEX "institutions_latitude_longitude_idx" ON "institutions"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "institution_external_ids_institution_id_idx" ON "institution_external_ids"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "institution_external_ids_source_external_id_key" ON "institution_external_ids"("source", "external_id");

-- CreateIndex
CREATE INDEX "institution_memberships_institution_id_status_idx" ON "institution_memberships"("institution_id", "status");

-- CreateIndex
CREATE INDEX "institution_memberships_user_id_idx" ON "institution_memberships"("user_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_external_ids" ADD CONSTRAINT "institution_external_ids_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- HAND-WRITTEN CONSTRAINTS
--
-- The statements below cannot be expressed in schema.prisma. They are not
-- optional polish: the partial unique indexes ARE the uniqueness rules for
-- this system, and the CHECK constraints are the last line of defence if a
-- future code path bypasses DTO validation.
--
-- Keep this block in sync with prisma/schema.prisma when either changes.
-- ===========================================================================

-- Trigram matching powers institution name search without a search engine.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --- users -----------------------------------------------------------------

-- Email is unique among LIVE users only, so a soft-deleted account does not
-- permanently block re-registration with that address.
CREATE UNIQUE INDEX "users_email_unique_live"
  ON "users" ("email")
  WHERE "deleted_at" IS NULL;

-- Defence in depth: the DTO lowercases email, this guarantees it. Without
-- this, "A@x.com" and "a@x.com" would be two distinct accounts.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_chk"
  CHECK ("email" = lower("email"));

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_format_chk"
  CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- --- institutions ----------------------------------------------------------

-- Slug is unique among live rows; soft-deleting an institution releases its
-- slug for reuse.
CREATE UNIQUE INDEX "institutions_slug_unique_live"
  ON "institutions" ("slug")
  WHERE "deleted_at" IS NULL;

ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_country_code_chk"
  CHECK ("country_code" ~ '^[A-Z]{2}$');

ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_latitude_range_chk"
  CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));

ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_longitude_range_chk"
  CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));

-- Coordinates are meaningless individually — reject a half-populated pair.
ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_coordinates_paired_chk"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_slug_format_chk"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- NOTE: the trigram (GIN) search indexes are declared in schema.prisma and
-- created by a later migration. Defining them only in raw SQL here caused
-- Prisma to treat them as drift and drop them on the next `migrate dev`.

-- The hot discovery path: published, non-deleted rows ordered by name.
CREATE INDEX "institutions_published_name_idx"
  ON "institutions" ("name")
  WHERE "deleted_at" IS NULL AND "status" = 'PUBLISHED';

-- --- institution_memberships ----------------------------------------------

-- A person may be BOTH a teacher and a student at one institution, but may
-- not hold the same role twice concurrently. Scoped to active rows so a
-- student who leaves can later re-enrol.
CREATE UNIQUE INDEX "memberships_user_institution_role_active"
  ON "institution_memberships" ("user_id", "institution_id", "role")
  WHERE "left_at" IS NULL;

-- An institution-issued ID (roll number, staff ID) identifies one active
-- member within that institution.
CREATE UNIQUE INDEX "memberships_institution_member_id_active"
  ON "institution_memberships" ("institution_id", "institution_member_id")
  WHERE "institution_member_id" IS NOT NULL AND "left_at" IS NULL;

-- A membership cannot end before it began.
ALTER TABLE "institution_memberships"
  ADD CONSTRAINT "memberships_dates_ordered_chk"
  CHECK ("left_at" IS NULL OR "joined_at" IS NULL OR "left_at" >= "joined_at");

-- --- refresh_tokens --------------------------------------------------------

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_hash_length_chk"
  CHECK (length("token_hash") = 64);


-- ###########################################################################
-- MIGRATION: 20260908164130_add_trigram_search_indexes
-- ###########################################################################

-- CreateIndex
CREATE INDEX "institutions_name_idx" ON "institutions" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "institutions_city_idx" ON "institutions" USING GIN ("city" gin_trgm_ops);


-- ###########################################################################
-- MIGRATION: 20260909042500_add_institution_media
-- ###########################################################################

-- CreateTable
CREATE TABLE "institution_media" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "alt_text" VARCHAR(300),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "attribution_text" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "institution_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institution_media_institution_id_sort_order_idx" ON "institution_media"("institution_id", "sort_order");

-- AddForeignKey
ALTER TABLE "institution_media" ADD CONSTRAINT "institution_media_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ###########################################################################
-- MIGRATION: 20261114131401_phase2_profiles_and_email_tokens
-- ###########################################################################

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'MEMBERS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "institution_memberships" ADD COLUMN     "created_by_user_id" UUID;

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "headline" VARCHAR(160),
    "bio" VARCHAR(2000),
    "location" VARCHAR(120),
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "request_ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_tokens_user_id_purpose_created_at_idx" ON "email_tokens"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "email_tokens_expires_at_idx" ON "email_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (not expressible in schema.prisma). Load-bearing:
-- they are the last line of defence if application validation is bypassed.
-- ---------------------------------------------------------------------------

-- Only SHA-256 digests are ever stored, never a raw token.
ALTER TABLE "email_tokens"
  ADD CONSTRAINT "email_tokens_hash_length_chk"
  CHECK (length("token_hash") = 64);

-- A token that expires before it is issued is a bug, not a token.
ALTER TABLE "email_tokens"
  ADD CONSTRAINT "email_tokens_expiry_after_creation_chk"
  CHECK ("expires_at" > "created_at");

-- Same normalisation rule as users.email, so comparisons are exact.
ALTER TABLE "email_tokens"
  ADD CONSTRAINT "email_tokens_email_lowercase_chk"
  CHECK ("email" = lower("email"));

-- Blank strings are stored as NULL, never as ''. The API trims and nulls
-- them; this stops a whitespace-only headline sneaking in another way.
ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_headline_not_blank_chk"
  CHECK ("headline" IS NULL OR length(btrim("headline")) > 0);
ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_bio_not_blank_chk"
  CHECK ("bio" IS NULL OR length(btrim("bio")) > 0);
ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_location_not_blank_chk"
  CHECK ("location" IS NULL OR length(btrim("location")) > 0);


-- ###########################################################################
-- MIGRATION: 20261114145913_admin_audit_log
-- ###########################################################################

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role" VARCHAR(40),
    "action" VARCHAR(80) NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" UUID,
    "institution_id" UUID,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_created_at_idx" ON "audit_logs"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_institution_id_created_at_idx" ON "audit_logs"("institution_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- ---------------------------------------------------------------------------
-- Hand-written: integrity rules Prisma cannot express.
-- ---------------------------------------------------------------------------

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_action_not_blank" CHECK (length(btrim("action")) > 0),
  ADD CONSTRAINT "audit_logs_target_type_not_blank" CHECK (length(btrim("target_type")) > 0),
  ADD CONSTRAINT "audit_logs_metadata_is_object" CHECK (jsonb_typeof("metadata") = 'object');

-- Append-only. The application role can INSERT and SELECT; any UPDATE or
-- DELETE — from a bug, a careless script or a compromised admin session — is
-- refused by the database itself. (TRUNCATE is a separate statement-level
-- operation used only by the test suite's reset and is not affected.)
CREATE FUNCTION "audit_logs_forbid_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_forbid_change"();

