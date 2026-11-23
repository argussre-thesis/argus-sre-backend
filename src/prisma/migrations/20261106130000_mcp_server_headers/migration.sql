-- AlterTable
ALTER TABLE "mcp_server" ADD COLUMN     "encrypted_headers" BYTEA,
ADD COLUMN     "header_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "encrypted_token" DROP NOT NULL;
