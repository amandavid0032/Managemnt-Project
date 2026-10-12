-- CreateIndex
CREATE INDEX "institutions_name_idx" ON "institutions" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "institutions_city_idx" ON "institutions" USING GIN ("city" gin_trgm_ops);
