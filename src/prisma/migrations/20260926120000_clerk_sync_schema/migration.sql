-- CreateEnum
CREATE TYPE "ClerkWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "user"
ADD COLUMN "clerk_updated_at" TIMESTAMP(3),
ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organization"
ADD COLUMN "clerk_updated_at" TIMESTAMP(3),
ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "membership"
ADD COLUMN "clerk_membership_id" TEXT NOT NULL,
ADD COLUMN "clerk_updated_at" TIMESTAMP(3),
ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "clerk_webhook_receipt" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_timestamp" TIMESTAMP(3) NOT NULL,
    "instance_id" TEXT,
    "status" "ClerkWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clerk_webhook_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_clerk_membership_id_key" ON "membership"("clerk_membership_id");

-- CreateIndex
CREATE INDEX "clerk_webhook_receipt_status_received_at_idx" ON "clerk_webhook_receipt"("status", "received_at");

-- CreateIndex
CREATE INDEX "clerk_webhook_receipt_event_type_event_timestamp_idx" ON "clerk_webhook_receipt"("event_type", "event_timestamp");
