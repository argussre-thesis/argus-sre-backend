/*
  Warnings:

  - You are about to drop the `profiles` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CreatorConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED');

-- DropTable
DROP TABLE "profiles";

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "image_url" TEXT,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "image_url" TEXT,
    "subscription_plan" TEXT,
    "subscription_status" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'org:member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_account" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "external_account_id" TEXT,
    "display_name" TEXT NOT NULL,
    "username" TEXT,
    "image_url" TEXT,
    "connection_status" "CreatorConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_assignment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "creator_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_id_key" ON "user"("id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_id_key" ON "organization"("id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "membership_user_id_idx" ON "membership"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organization_id_user_id_key" ON "membership"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_id_organization_id_key" ON "membership"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_account_external_account_id_key" ON "creator_account"("external_account_id");

-- CreateIndex
CREATE INDEX "creator_account_organization_id_idx" ON "creator_account"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_account_id_organization_id_key" ON "creator_account"("id", "organization_id");

-- CreateIndex
CREATE INDEX "creator_assignment_organization_id_idx" ON "creator_assignment"("organization_id");

-- CreateIndex
CREATE INDEX "creator_assignment_creator_account_id_idx" ON "creator_assignment"("creator_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_assignment_membership_id_creator_account_id_key" ON "creator_assignment"("membership_id", "creator_account_id");

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_account" ADD CONSTRAINT "creator_account_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_assignment" ADD CONSTRAINT "creator_assignment_membership_id_organization_id_fkey" FOREIGN KEY ("membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_assignment" ADD CONSTRAINT "creator_assignment_creator_account_id_organization_id_fkey" FOREIGN KEY ("creator_account_id", "organization_id") REFERENCES "creator_account"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
