import { isPrismaError, prisma } from "../lib/prisma";
import {
  CreateMcpServerInput,
  UpdateMcpServerInput,
} from "../schemas/mcpServer.schema";
import { OrgContext } from "../types/express";
import { fail, ok } from "../types/serviceResponse";
import { publicHttpsUrlProblem } from "../utils/publicUrl";
import { logger } from "../utils/logger";
import { decryptSecret, encryptSecret } from "../utils/token";

const mcpServerSelect = {
  id: true,
  name: true,
  url: true,
  headerNames: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Sending one kind of credential clears the other.
const credentialColumns = ({ token, headers }: Pick<CreateMcpServerInput, "token" | "headers">) =>
  headers
    ? { encryptedToken: null, encryptedHeaders: encryptSecret(JSON.stringify(headers)), headerNames: Object.keys(headers) }
    : { encryptedToken: encryptSecret(token!), encryptedHeaders: null, headerNames: [] };

const mcpServerNotFound = () =>
  fail(404, "MCP_SERVER_NOT_FOUND", "MCP server not found");

const mcpServerNameTaken = (name: string) =>
  fail(409, "MCP_SERVER_NAME_TAKEN", `An MCP server named "${name}" already exists`);

const findUrlProblem = async (url: string) => {
  const problem = await publicHttpsUrlProblem(url);
  return problem ? fail(400, "INVALID_MCP_URL", problem) : null;
};

export const mcpServersForAgent = async (organizationId: string) => {
  const servers = await prisma.mcpServer.findMany({
    where: { organizationId },
    select: { name: true, url: true, encryptedToken: true, encryptedHeaders: true },
    orderBy: { createdAt: "asc" },
  });

  return servers.flatMap(({ name, url, encryptedToken, encryptedHeaders }) => {
    try {
      return [
        encryptedHeaders
          ? { name, url, headers: JSON.parse(decryptSecret(encryptedHeaders)) as Record<string, string> }
          : { name, url, token: decryptSecret(encryptedToken!) },
      ];
    } catch (err) {
      logger.error({ err, organizationId, name }, "MCP server credentials can't be decrypted, skipping the server");
      return [];
    }
  });
};

export const listMcpServersService = async (org: OrgContext) => {
  const servers = await prisma.mcpServer.findMany({
    where: { organizationId: org.organizationId },
    select: mcpServerSelect,
    orderBy: { createdAt: "asc" },
  });

  return ok(servers);
};

export const createMcpServerService = async (
  org: OrgContext,
  input: CreateMcpServerInput,
) => {
  const invalid = await findUrlProblem(input.url);
  if (invalid) return invalid;

  try {
    const server = await prisma.mcpServer.create({
      data: {
        organizationId: org.organizationId,
        name: input.name,
        url: input.url,
        ...credentialColumns(input),
      },
      select: mcpServerSelect,
    });

    return ok(server);
  } catch (error) {
    if (isPrismaError(error, "P2002")) return mcpServerNameTaken(input.name);
    throw error;
  }
};

export const updateMcpServerService = async (
  org: OrgContext,
  mcpServerId: string,
  input: UpdateMcpServerInput,
) => {
  const current = await prisma.mcpServer.findFirst({
    where: { id: mcpServerId, organizationId: org.organizationId },
    select: { url: true },
  });
  if (!current) return mcpServerNotFound();

  if (input.url && input.url !== current.url) {
    if (!input.token && !input.headers) {
      return fail(400, "MCP_TOKEN_REQUIRED", "Enter the token or headers again to change the URL");
    }
    const invalid = await findUrlProblem(input.url);
    if (invalid) return invalid;
  }

  try {
    const server = await prisma.mcpServer.update({
      where: { id: mcpServerId, organizationId: org.organizationId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.url && { url: input.url }),
        ...((input.token || input.headers) && credentialColumns(input)),
      },
      select: mcpServerSelect,
    });

    return ok(server);
  } catch (error) {
    if (isPrismaError(error, "P2025")) return mcpServerNotFound();
    if (isPrismaError(error, "P2002") && input.name) {
      return mcpServerNameTaken(input.name);
    }
    throw error;
  }
};

export const deleteMcpServerService = async (
  org: OrgContext,
  mcpServerId: string,
) => {
  const { count } = await prisma.mcpServer.deleteMany({
    where: { id: mcpServerId, organizationId: org.organizationId },
  });

  if (count === 0) return mcpServerNotFound();
  return ok(null);
};
