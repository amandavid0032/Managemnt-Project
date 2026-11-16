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
