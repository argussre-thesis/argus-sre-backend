-- DropForeignKey
ALTER TABLE "creator_account" DROP CONSTRAINT "creator_account_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "creator_assignment" DROP CONSTRAINT "creator_assignment_membership_id_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "creator_assignment" DROP CONSTRAINT "creator_assignment_creator_account_id_organization_id_fkey";

-- DropIndex
DROP INDEX "membership_id_organization_id_key";

-- DropTable
DROP TABLE "creator_account";

-- DropTable
DROP TABLE "creator_assignment";

-- DropEnum
DROP TYPE "CreatorConnectionStatus";

