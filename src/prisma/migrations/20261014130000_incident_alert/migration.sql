-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('FIRING', 'RESOLVED');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "incident_grouping_window_minutes" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "incident" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "cluster_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "alert_source_id" TEXT,
    "fingerprint" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'FIRING',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "labels" JSONB NOT NULL,
    "annotations" JSONB NOT NULL,
    "generator_url" TEXT,
    "last_received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_organization_id_cluster_id_status_created_at_idx" ON "incident"("organization_id", "cluster_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "alert_incident_id_status_idx" ON "alert"("incident_id", "status");

-- CreateIndex
CREATE INDEX "alert_alert_source_id_idx" ON "alert"("alert_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_organization_id_fingerprint_starts_at_key" ON "alert"("organization_id", "fingerprint", "starts_at");

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "cluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_alert_source_id_fkey" FOREIGN KEY ("alert_source_id") REFERENCES "alert_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

