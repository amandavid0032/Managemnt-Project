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
