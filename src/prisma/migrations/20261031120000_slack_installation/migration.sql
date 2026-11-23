-- AlterTable
ALTER TABLE "incident" ADD COLUMN     "slack_channel_id" TEXT,
ADD COLUMN     "slack_ts" TEXT;

-- CreateTable
CREATE TABLE "slack_installation" (
    "organization_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "bot_user_id" TEXT NOT NULL,
    "encrypted_token" BYTEA NOT NULL,
    "installed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_installation_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_installation_team_id_key" ON "slack_installation"("team_id");

-- AddForeignKey
ALTER TABLE "slack_installation" ADD CONSTRAINT "slack_installation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

