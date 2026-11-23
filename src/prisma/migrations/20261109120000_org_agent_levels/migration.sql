-- CreateEnum
CREATE TYPE "AgentLevel" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "investigation_level" "AgentLevel" NOT NULL DEFAULT 'low',
ADD COLUMN     "conversation_level" "AgentLevel" NOT NULL DEFAULT 'low';
