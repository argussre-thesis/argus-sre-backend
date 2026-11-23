-- CreateTable
CREATE TABLE "cluster" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "last_connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cluster_token_hash_key" ON "cluster"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cluster_organization_id_name_key" ON "cluster"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

