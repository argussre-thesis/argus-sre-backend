import express from "express";
import {
  createAlertSource,
  deleteAlertSource,
  listAlertSources,
  rotateAlertSourceToken,
  updateAlertSource,
} from "../controller/alertSource.controller";
import {
  createCluster,
  deleteCluster,
  listClusters,
  rotateClusterToken,
} from "../controller/cluster.controller";
import {
  getIncident,
  getInvestigation,
  getInvestigationMessages,
  investigateIncident,
  listIncidentInvestigations,
  listIncidents,
  resolveIncident,
} from "../controller/incident.controller";
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  updateMcpServer,
} from "../controller/mcpServer.controller";
import {
  getOrganization,
  listInvitations,
  listMemberships,
  listMyOrganizations,
  updateOrganizationSettings,
} from "../controller/organization.controller";
import {
  createSlackInstallUrl,
  disconnectSlack,
  getSlackStatus,
} from "../controller/slack.controller";
import { requireOrgMembership, requireOrgRole } from "../middleware/orgAuth";
import { validateBody } from "../middleware/validateSchema";
import { ORG_ROLES } from "../model/organizationModel";
import {
  createAlertSourceSchema,
  updateAlertSourceSchema,
} from "../schemas/alertSource.schema";
import { createClusterSchema } from "../schemas/cluster.schema";
import {
  createMcpServerSchema,
  updateMcpServerSchema,
} from "../schemas/mcpServer.schema";
import { updateOrganizationSettingsSchema } from "../schemas/organization.schema";

const organizationRoutes = express.Router();

organizationRoutes.get("/", listMyOrganizations);

organizationRoutes.get(
  "/:organizationId",
  requireOrgMembership,
  getOrganization,
);
organizationRoutes.patch(
  "/:organizationId/settings",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  validateBody(updateOrganizationSettingsSchema),
  updateOrganizationSettings,
);
organizationRoutes.get(
  "/:organizationId/slack",
  requireOrgMembership,
  getSlackStatus,
);
organizationRoutes.post(
  "/:organizationId/slack/install",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  createSlackInstallUrl,
);
organizationRoutes.delete(
  "/:organizationId/slack",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  disconnectSlack,
);
organizationRoutes.get(
  "/:organizationId/memberships",
  requireOrgMembership,
  listMemberships,
);
organizationRoutes.get(
  "/:organizationId/invitations",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  listInvitations,
);

organizationRoutes.get(
  "/:organizationId/clusters",
  requireOrgMembership,
  listClusters,
);
organizationRoutes.post(
  "/:organizationId/clusters",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  validateBody(createClusterSchema),
  createCluster,
);
organizationRoutes.post(
  "/:organizationId/clusters/:clusterId/token",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  rotateClusterToken,
);
organizationRoutes.delete(
  "/:organizationId/clusters/:clusterId",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  deleteCluster,
);

organizationRoutes.get(
  "/:organizationId/alert-sources",
  requireOrgMembership,
  listAlertSources,
);
organizationRoutes.post(
  "/:organizationId/alert-sources",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  validateBody(createAlertSourceSchema),
  createAlertSource,
);
organizationRoutes.patch(
  "/:organizationId/alert-sources/:alertSourceId",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  validateBody(updateAlertSourceSchema),
  updateAlertSource,
);
organizationRoutes.post(
  "/:organizationId/alert-sources/:alertSourceId/token",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  rotateAlertSourceToken,
);
organizationRoutes.delete(
  "/:organizationId/alert-sources/:alertSourceId",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  deleteAlertSource,
);

organizationRoutes.get(
  "/:organizationId/mcp-servers",
  requireOrgMembership,
  listMcpServers,
);
organizationRoutes.post(
  "/:organizationId/mcp-servers",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  validateBody(createMcpServerSchema),
  createMcpServer,
);
organizationRoutes.patch(
  "/:organizationId/mcp-servers/:mcpServerId",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  validateBody(updateMcpServerSchema),
  updateMcpServer,
);
organizationRoutes.delete(
  "/:organizationId/mcp-servers/:mcpServerId",
  requireOrgMembership,
  requireOrgRole(ORG_ROLES.ADMIN),
  deleteMcpServer,
);

organizationRoutes.get(
  "/:organizationId/incidents",
  requireOrgMembership,
  listIncidents,
);
organizationRoutes.get(
  "/:organizationId/incidents/:incidentId",
  requireOrgMembership,
  getIncident,
);
organizationRoutes.post(
  "/:organizationId/incidents/:incidentId/resolve",
  requireOrgMembership,
  resolveIncident,
);
organizationRoutes.post(
  "/:organizationId/incidents/:incidentId/investigate",
  requireOrgMembership,
  investigateIncident,
);
organizationRoutes.get(
  "/:organizationId/incidents/:incidentId/investigations",
  requireOrgMembership,
  listIncidentInvestigations,
);
organizationRoutes.get(
  "/:organizationId/investigations/:investigationId",
  requireOrgMembership,
  getInvestigation,
);
organizationRoutes.get(
  "/:organizationId/investigations/:investigationId/messages",
  requireOrgMembership,
  getInvestigationMessages,
);

export default organizationRoutes;
