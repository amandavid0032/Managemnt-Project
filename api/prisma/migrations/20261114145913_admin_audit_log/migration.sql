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
