CREATE TABLE "systems" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "systems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "collection" TEXT NOT NULL,
    "sub_path" TEXT,
    "full_path" TEXT NOT NULL,
    "system_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "systems_name_key" ON "systems"("name");
CREATE UNIQUE INDEX "systems_slug_key" ON "systems"("slug");
CREATE UNIQUE INDEX "systems_api_key_key" ON "systems"("api_key");
CREATE INDEX "files_system_id_collection_idx" ON "files"("system_id", "collection");
CREATE INDEX "files_collection_idx" ON "files"("collection");

ALTER TABLE "files" ADD CONSTRAINT "files_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
