-- CreateTable
CREATE TABLE "alert_source" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "cluster_label" TEXT NOT NULL DEFAULT 'cluster',
    "last_received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_source_cluster" (
    "alert_source_id" TEXT NOT NULL,
    "cluster_id" TEXT NOT NULL,

    CONSTRAINT "alert_source_cluster_pkey" PRIMARY KEY ("alert_source_id","cluster_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_source_token_hash_key" ON "alert_source"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "alert_source_organization_id_name_key" ON "alert_source"("organization_id", "name");

-- CreateIndex
CREATE INDEX "alert_source_cluster_cluster_id_idx" ON "alert_source_cluster"("cluster_id");

-- AddForeignKey
ALTER TABLE "alert_source" ADD CONSTRAINT "alert_source_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_source_cluster" ADD CONSTRAINT "alert_source_cluster_alert_source_id_fkey" FOREIGN KEY ("alert_source_id") REFERENCES "alert_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_source_cluster" ADD CONSTRAINT "alert_source_cluster_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

