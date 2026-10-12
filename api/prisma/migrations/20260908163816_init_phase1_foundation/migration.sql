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
