# API Usage Documentation

The backend has three API surfaces, each with its own auth:

| Base | Auth | Called by |
|---|---|---|
| `/api/v1` | Clerk session: `Authorization: Bearer <Clerk session token>` | The frontend |
| `/webhooks/v1` | Alert source token: `Authorization: Bearer argus_wh_…` | Grafana / Alertmanager |
| `/internal/v1` | Shared secret: `Authorization: Bearer <GATEWAY_BACKEND_TOKEN>` | The gateway (service to service) |

Plus:
- `POST /api/v1/webhooks/clerk`: Clerk (Svix-signed) user, organization, membership and invitation events. Not for the frontend.
- `GET /` and `GET /health` (`503 SERVICE_UNAVAILABLE` when the DB is down).

All `/api/v1/*` routes (except the Clerk webhook) are protected by Clerk auth (`requireAuth`) and user sync (`syncUser`) before controller logic runs. A missing or invalid session returns `401 UNAUTHORIZED`. Unknown routes return `404 ROUTE_NOT_FOUND`.

**Rate limits** (per client IP, `X-RateLimit-*` response headers, `429` when exceeded):
- `/api/*`: 100 requests per 15 minutes.
- `/webhooks/v1/*`: 1000 requests per minute.
- `/internal/v1/*`: none.

**Tokens** (`argus_rt_…` runner, `argus_wh_…` alert source) are returned **once**, in the create or rotate response. Only a hash is stored, so they can't be fetched again. The frontend must show the token right away and tell the user to copy it.

---

## Response format

### Success responses
Successful requests use this shape:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

The HTTP status is communicated by the response status code and is not duplicated
in the response body.

### Error responses

Handled service errors, authentication errors, validation errors, unknown routes,
and unexpected errors all use the same envelope:

```json
{
  "success": false,
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "message": "Profile not found",
    "details": null
  }
}
```

`code` is a stable, machine-readable value for frontend behavior. `message` is
human-readable. `details` contains structured information when useful and is
otherwise `null`.

### Validation errors (`validateBody`)
Body validation errors return:

- HTTP status `400`
- `error.code`: `"VALIDATION_ERROR"`
- `error.message`: `"Request body validation failed"`
- `error.details`: Zod `flatten()` output

Bodies are strict: unknown fields are rejected with `400 VALIDATION_ERROR` (except the alert webhook, which drops extra fields).

Before validation: malformed JSON returns `400 INVALID_REQUEST_BODY`, and a body over the size limit (1 MB on the alert webhook, 100 KB elsewhere) returns `413 PAYLOAD_TOO_LARGE`.

---

## Validation patterns

There are two validation helpers in this template, used at different layers:

- **`validateBody(schema)`** (`src/middleware/validateSchema.ts`) — route middleware for validating `req.body`. On failure it short-circuits the request with the standard error envelope. Wire it into the route: `router.patch("/", validateBody(updateProfileSchema), controllerFn)`.
- **`parseQuery(schema, query)`** (`src/utils/parseQuery.ts`) — a plain function for validating query params (e.g. `req.query`) inside a service/model function, not a middleware. It returns a `ServiceResult<T>` (`ok(data)` or `fail(status, code, message, details)`) so the calling service can return the same kind of handled error as other business logic.

Use `validateBody` when you want validation to happen at the route boundary before any controller/service code runs. Use `parseQuery` when the validation result needs to flow through the same `ServiceResult` plumbing as the rest of a service function (e.g. validating query params alongside a DB lookup in one function).

### Unhandled errors (global error middleware)
Unhandled exceptions use the same error envelope. In production, internal error
messages are replaced with a safe message:

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Internal Server Error",
    "details": null
  }
}
```

---

## User

### `GET /user`
Returns the authenticated user's record: `id`, `firstName`, `lastName`, `email`,
`displayName`, `imageUrl`, `isBanned`, `lastSeenAt`, `createdAt`, `updatedAt`, …

**Success**: `200`

**Possible handled errors**:
- `404 PROFILE_NOT_FOUND`

### `PATCH /user`
Updates the authenticated user's profile.

**Body schema**

```json
{
  "displayName": "string (1..100, optional)"
}
```

**Success**: `200`, the updated user.

**Possible handled errors**:
- `404 PROFILE_NOT_FOUND`

---

## Organizations

Organizations are created and managed in Clerk (the frontend uses Clerk's
components for creating orgs and inviting members). The backend mirrors them
through the Clerk webhook. The org id is Clerk's (`org_…`).

Org-scoped routes take the org in the path (`/organizations/:organizationId/...`).
`requireOrgMembership` (`src/middleware/orgAuth.ts`) checks the caller has an
active membership in that org (from the webhook-synced `membership` table) and
attaches `req.org = { organizationId, membershipId, role }`.
`requireOrgRole(...roles)` can be chained after it to gate by Clerk org role
(`org:admin`, `org:member`).

- Non-members, unknown or deleted orgs, and malformed IDs all return `404 ORGANIZATION_NOT_FOUND`
  (no existence leak).
- Members without a required role get `403 INSUFFICIENT_ORG_ROLE`.

### `GET /organizations`
Organizations the authenticated user belongs to:
`[{ id, name, slug, imageUrl, role, joinedAt }]`.

### `GET /organizations/:organizationId`
**Members only.**

```json
{
  "id": "org_…",
  "name": "Acme",
  "slug": "acme",
  "imageUrl": "https://…",
  "incidentGroupingWindowMinutes": 10,
  "autoInvestigateEnabled": false,
  "investigationLevel": "low",
  "conversationLevel": "low",
  "webSearchToolEnabled": false,
  "maxModelCalls": 10,
  "createdAt": "…",
  "memberCount": 3,
  "currentUserRole": "org:admin"
}
```

### `PATCH /organizations/:organizationId/settings`
**`org:admin` only.**

**Body schema**

```json
{
  "incidentGroupingWindowMinutes": "integer (0..1440)",
  "autoInvestigateEnabled": "boolean",
  "investigationLevel": "low | medium | high",
  "conversationLevel": "low | medium | high",
  "webSearchToolEnabled": "boolean",
  "maxModelCalls": "integer (1..100)"
}
```

Every field is required: the body replaces the settings.

`incidentGroupingWindowMinutes`: a new firing alert joins an open incident on
the same cluster that was created within this many minutes; otherwise it opens a
new incident. `0` = only alerts in the same notification are grouped. Default `10`.

`autoInvestigateEnabled`: whether a new firing alert starts an investigation.
Incidents are always created, and the manual "Investigate" works either way.
Default `false`.

`investigationLevel` / `conversationLevel`: how hard the agent works on
investigations (manual and automatic) and on Slack conversations. The agent
service maps each level to a model and an effort; higher costs more and is
slower. Default `low`.

`webSearchToolEnabled`: whether the agent can search the web (the model
provider's hosted search) in investigations and Slack conversations. Searches
are billed per use. Default `false`.

`maxModelCalls`: how many model calls one investigation or Slack conversation
turn may make, the final answer included; the agent is told this budget. A run
that reaches it fails. Default `10`.

**Success**: `200`, `{ incidentGroupingWindowMinutes, autoInvestigateEnabled, investigationLevel, conversationLevel, webSearchToolEnabled, maxModelCalls }`.

### `GET /organizations/:organizationId/memberships`
**Members only.**
`[{ id, role, joinedAt, user: { id, displayName, email, imageUrl } }]`.

### `GET /organizations/:organizationId/invitations`
**`org:admin` only.**
`[{ id, emailAddress, role, status, expiresAt, acceptedAt, revokedAt, createdAt }]`,
newest first. `status` is `PENDING | ACCEPTED | REVOKED | EXPIRED`; `PENDING`
invites past `expiresAt` are returned as `EXPIRED`.

---

## Clusters

A cluster is one Kubernetes cluster with one runner. Its `name` must equal the
runner's `CLUSTER_NAME` and is what alerts' cluster label is matched against.

Cluster object: `{ id, name, lastConnectedAt, createdAt }`.
`lastConnectedAt` is `null` until the runner first connects.

### `GET /organizations/:organizationId/clusters`
**Members only.** All clusters of the org, oldest first.

### `POST /organizations/:organizationId/clusters`
**`org:admin` only.**

**Body schema**

```json
{
  "name": "string (DNS-1123 label: 1..63 chars, lowercase letters, digits, '-', starts and ends alphanumeric)"
}
```

The name can't be changed later (there is no update endpoint).

**Success**: `201`

```json
{
  "cluster": { "id": "…", "name": "prod-eu-1", "lastConnectedAt": null, "createdAt": "…" },
  "token": "argus_rt_…"
}
```

The runner token is shown only here.

**Possible handled errors**:
- `409 CLUSTER_NAME_TAKEN`

### `POST /organizations/:organizationId/clusters/:clusterId/token`
**`org:admin` only.** Rotates the runner token. The old token stops working at once.

**Success**: `200`, `{ token }`.

**Possible handled errors**:
- `404 CLUSTER_NOT_FOUND`

### `DELETE /organizations/:organizationId/clusters/:clusterId`
**`org:admin` only.** Hard delete. The cluster is removed from every alert
source; its incidents are kept with `clusterId: null` (unknown cluster).

**Success**: `200`, `data: null`.

**Possible handled errors**:
- `404 CLUSTER_NOT_FOUND`

---

## Alert sources

An alert source is one sender of alerts (a Grafana instance or one
Alertmanager) with its own webhook token and a list of clusters it may send
alerts for.

Alert source object:

```json
{
  "id": "…",
  "name": "grafana-cloud",
  "clusterLabel": "cluster",
  "lastReceivedAt": null,
  "createdAt": "…",
  "clusters": [{ "id": "…", "name": "prod-eu-1" }]
}
```

- `lastReceivedAt`: when the last webhook call arrived, `null` = never. Show it
  as "last alert 5 min ago / never"; it is the first thing to check when a setup
  doesn't work.
- `clusterLabel`: the **label key** read from each alert to find its cluster
  (default `cluster`), not a cluster name. Per alert:
  - the label's value names a cluster in `clusters` → that cluster;
  - the label is missing and `clusters` has exactly one → that cluster;
  - otherwise → unknown cluster (`clusterId: null`, not investigated).

  Hide it under "Advanced" in the UI with help text like "the label that holds
  the cluster name".

### `GET /organizations/:organizationId/alert-sources`
**Members only.** All alert sources of the org, oldest first.

### `POST /organizations/:organizationId/alert-sources`
**`org:admin` only.**

**Body schema**

```json
{
  "name": "string (1..100, trimmed, unique in the org)",
  "clusterIds": "string[] (1..100 cluster ids of this org, duplicates removed)",
  "clusterLabel": "string (optional, Prometheus label name: [a-zA-Z_][a-zA-Z0-9_]*, default \"cluster\")"
}
```

**Success**: `201`, `{ alertSource, token }`. The webhook token (`argus_wh_…`) is
shown only here. Show it together with the webhook URL
(`<API base>/webhooks/v1/alerts`).

**Possible handled errors**:
- `400 INVALID_CLUSTER_IDS`: some ids are not clusters of this org.
- `409 ALERT_SOURCE_NAME_TAKEN`

### `PATCH /organizations/:organizationId/alert-sources/:alertSourceId`
**`org:admin` only.** Any subset of the create fields, at least one.
`clusterIds` replaces the whole list. The token doesn't change.

**Success**: `200`, the updated alert source.

**Possible handled errors**:
- `400 INVALID_CLUSTER_IDS`
- `404 ALERT_SOURCE_NOT_FOUND`
- `409 ALERT_SOURCE_NAME_TAKEN`

### `POST /organizations/:organizationId/alert-sources/:alertSourceId/token`
**`org:admin` only.** Rotates the webhook token. The old token stops working at
once; alerts are rejected until the sender is updated.

**Success**: `200`, `{ token }`.

**Possible handled errors**:
- `404 ALERT_SOURCE_NOT_FOUND`

### `DELETE /organizations/:organizationId/alert-sources/:alertSourceId`
**`org:admin` only.** Its alerts and incidents are kept (`alertSourceId: null`).

**Success**: `200`, `data: null`.

**Possible handled errors**:
- `404 ALERT_SOURCE_NOT_FOUND`

---

## MCP servers

A remote MCP server whose tools the org's agent runs can use. The customer runs
it or a vendor hosts it, and we connect with a bearer token. Use a read-only
token: every tool the server exposes reaches the agent, and runs start on their
own from alert text.

MCP server object:

```json
{
  "id": "…",
  "name": "prod-grafana",
  "url": "https://mcp.example.com/mcp",
  "headerNames": ["api-key"],
  "createdAt": "…",
  "updatedAt": "…"
}
```

- `name` prefixes the server's tools, e.g. `prod-grafana_query_prometheus`.
- The token and header values are never returned. `headerNames` is empty for a
  server using a token.

### `GET /organizations/:organizationId/mcp-servers`
**Members only.** All MCP servers of the org, oldest first.

### `POST /organizations/:organizationId/mcp-servers`
**`org:admin` only.**

**Body schema**

```json
{
  "name": "string (1..20, trimmed, lowercase letters, numbers and hyphens, unique in the org)",
  "url": "string (up to 2048, trimmed, https, public address)",
  "token": "string (up to 8192, trimmed, no spaces), sent as Authorization: Bearer <token>",
  "headers": "object of header name to value (1..20 headers; names up to 100 letters, numbers, hyphens or underscores; values up to 8192, trimmed, printable ASCII)"
}
```

Send exactly one of `token` and `headers`. Use `headers` when a server doesn't
take a Bearer token, e.g. `{ "api-key": "…" }` or `{ "Authorization": "Token …" }`.
These can't be set: `Host`, `Connection`, `Content-Length`, `Transfer-Encoding`,
`Content-Type`, `Accept`, `Mcp-Session-Id`, `Mcp-Protocol-Version`.

**Success**: `201`, the MCP server.

**Possible handled errors**:
- `400 INVALID_MCP_URL`: the message says what's wrong; show it on the form.
- `409 MCP_SERVER_NAME_TAKEN`

### `PATCH /organizations/:organizationId/mcp-servers/:mcpServerId`
**`org:admin` only.** Any subset of the create fields, at least one, and not both
`token` and `headers`. Leave both out to keep the stored credentials. Sending one
replaces the stored credentials: `headers` replaces all stored headers and clears
the token, and `token` clears the headers. Changing `url` requires `token` or
`headers` too, so stored credentials can't be sent to a new address.

**Success**: `200`, the updated MCP server.

**Possible handled errors**:
- `400 INVALID_MCP_URL`
- `400 MCP_TOKEN_REQUIRED`: `url` changed without a `token` or `headers`.
- `404 MCP_SERVER_NOT_FOUND`
- `409 MCP_SERVER_NAME_TAKEN`

### `DELETE /organizations/:organizationId/mcp-servers/:mcpServerId`
**`org:admin` only.**

**Success**: `200`, `data: null`.

**Possible handled errors**:
- `404 MCP_SERVER_NOT_FOUND`

---

## Incidents

Incidents are created by the alert webhook (see below); one incident holds one
or more alerts from one cluster.

Incident object:

```json
{
  "id": "…",
  "title": "5xx above 5%",
  "status": "OPEN | RESOLVED",
  "isTest": false,
  "createdAt": "…",
  "resolvedAt": null,
  "cluster": { "id": "…", "name": "prod-eu-1" }
}
```

- `cluster: null` = unknown cluster (the alert's cluster label didn't match, or
  the cluster was deleted). Show it as a setup problem; it is not investigated.
- `isTest`: opened by Grafana's contact point **Test** button. Real alerts never
  join it, and it is never investigated.

### `GET /organizations/:organizationId/incidents`
**Members only.** Newest first. Each incident also has `firingAlertCount`.

**Query params** (unknown params are rejected with `400 QUERY_VALIDATION_ERROR`)

| Param | |
|---|---|
| `status` | `OPEN` or `RESOLVED` (optional) |
| `clusterId` | a cluster id, or `unknown` for unknown-cluster incidents (optional) |
| `limit` | 1..100, default 50 |
| `cursor` | `nextCursor` from the previous page |

**Success**: `200`, `{ incidents, nextCursor }`. `nextCursor` is `null` on the
last page; pass it back as `cursor` to get the next one.

### `GET /organizations/:organizationId/incidents/:incidentId`
**Members only.** The incident with all its alerts, oldest first:

```json
{
  "…incident fields": "…",
  "alerts": [
    {
      "id": "…",
      "status": "FIRING | RESOLVED",
      "fingerprint": "c8f5e3a1b2d4e6f7",
      "startsAt": "…",
      "endsAt": null,
      "lastReceivedAt": "…",
      "labels": { "alertname": "HighErrorRate", "cluster": "prod-eu-1" },
      "annotations": { "summary": "5xx above 5%" },
      "generatorUrl": "http://… (link back to Grafana / Prometheus, or null)",
      "alertSource": { "id": "…", "name": "grafana-cloud" }
    }
  ]
}
```

`alertSource` is `null` if the source was deleted. `lastReceivedAt` is when the
sender last repeated the alert.

**Possible handled errors**:
- `404 INCIDENT_NOT_FOUND`

### `POST /organizations/:organizationId/incidents/:incidentId/resolve`
**Members only.** Resolves the incident by hand, for incidents stuck open (the
resolved message never came). Alerts still firing are resolved too. If the
sender keeps repeating one of them, it stays resolved; only a new firing opens a
new incident. Resolving a resolved incident changes nothing.

**Success**: `200`, the incident with its alerts (as in the `GET` above).

**Possible handled errors**:
- `404 INCIDENT_NOT_FOUND`

### `POST /organizations/:organizationId/incidents/:incidentId/investigate`
**Members only.** Starts an agent investigation of the incident (the
"Investigate" button). Works on open and resolved incidents, and can be pressed
again once the previous run has finished. The run goes on in the background.

**Success**: `202`, `{ id }`, the investigation's id.

**Possible handled errors**:
- `404 INCIDENT_NOT_FOUND`
- `409 TEST_INCIDENT`: test incidents are never investigated
- `409 UNKNOWN_CLUSTER`: `cluster` is `null`, so there is no runner to ask
- `409 INVESTIGATION_RUNNING`: a run for this incident is still going;
  `details.id` is its id
- `503 SERVICE_UNAVAILABLE`: the agent service can't be reached; try again later

### `GET /organizations/:organizationId/incidents/:incidentId/investigations`
**Members only.** The incident's investigations, newest first (an incident has
several when "Investigate" was pressed again). An unknown incident gives an
empty list, not a 404.

**Success**: `200`, `{ investigations }`:

```json
{
  "id": "…",
  "tenantId": "org_…",
  "incidentId": "…",
  "cluster": "prod-eu-1",
  "model": "anthropic:claude-opus-5-5",
  "effort": "high",
  "status": "running | done | failed",
  "report": "# Markdown RCA … (null until done)",
  "error": "why it failed (null unless failed)",
  "startedAt": "…",
  "finishedAt": null
}
```

Poll while the newest one is `running`.

**Possible handled errors**:
- `503 SERVICE_UNAVAILABLE`: the agent service can't be reached; try again later

## Investigations

### `GET /organizations/:organizationId/investigations/:investigationId`
**Members only.** One investigation, the same object as in the incident's list
above. Poll it every few seconds while `status` is `running`.

**Possible handled errors**:
- `404 INVESTIGATION_NOT_FOUND` (also another org's investigation)
- `503 SERVICE_UNAVAILABLE`

### `GET /organizations/:organizationId/investigations/:investigationId/messages`
**Members only.** The transcript: every message of the run in order, for the
evidence links, the timeline, and the audit.

**Success**: `200`, `{ messages }`:

```json
{
  "seq": 0,
  "data": { "type": "human | ai | tool", "data": { "content": "…" } },
  "createdAt": "…"
}
```

`data` is LangChain's stored message, as the agent saved it:
- `human` (seq 0): the incident as sent to the agent.
- `ai`: a model reply; `data.tool_calls` lists the tools it called (`name`,
  `args`, `id`). `content` is a string or a list of blocks (`text`, and on Claude
  `thinking`).
- `tool`: a tool result; `data.tool_call_id` matches the call's `id`,
  `data.status` is `error` on a failure.

**Possible handled errors**:
- `404 INVESTIGATION_NOT_FOUND`
- `503 SERVICE_UNAVAILABLE`

---

## Alert webhook

### `POST /webhooks/v1/alerts`
Called by Grafana (webhook contact point) or Alertmanager (`webhook_configs`),
not by the frontend. Outside Clerk auth and the `/api` rate limit.

**Auth**: `Authorization: Bearer argus_wh_…`. The token alone decides the org and
the allowed clusters; nothing in the body is trusted for that.

**Body**: the Alertmanager webhook payload (Grafana sends the same shape plus
extra fields, which are dropped). Only `alerts` is read; max 1000 alerts, 1 MB.

```json
{
  "alerts": [
    {
      "status": "firing | resolved",
      "labels": { "alertname": "HighErrorRate", "cluster": "prod-eu-1" },
      "annotations": { "summary": "5xx above 5%" },
      "startsAt": "2026-10-14T09:00:00Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "http://…",
      "fingerprint": "c8f5e3a1b2d4e6f7"
    }
  ]
}
```

Each alert's own `status` is used (one payload can mix firing and resolved).
`(fingerprint, startsAt)` identifies one firing:
- seen before → a repeat; only `lastReceivedAt` is updated;
- `resolved` → the alert is resolved; the incident is resolved when none of its alerts are still firing;
- new and `firing` → joins an open incident on the same cluster created within the org's grouping window, or opens a new incident (title = `annotations.summary`, else `labels.alertname`); a Grafana test alert always opens its own incident (`isTest`), and real alerts never join one. If the org's `autoInvestigateEnabled` is on and that incident has never been investigated, an investigation starts (not for test or unknown-cluster incidents); each incident gets at most one automatic run, and a manual "Investigate" counts as its run;
- new and `resolved` → ignored.

Retries are safe: re-sending a payload gives the same result.

**Success**: `200`, `{ received: <number of alerts> }`.

**Possible handled errors**:
- `401 INVALID_ALERT_TOKEN`: missing, unknown or rotated token, or the org is deleted.
- `400 VALIDATION_ERROR`

---

## Internal API (gateway)

### `POST /internal/v1/runner-tokens/verify`
Called by the gateway when a runner connects (`hello`). Not reachable with a
Clerk session.

**Auth**: `Authorization: Bearer <GATEWAY_BACKEND_TOKEN>`, otherwise
`401 INVALID_INTERNAL_TOKEN`.

**Body schema**

```json
{
  "token": "string (the runner's argus_rt_… token)"
}
```

**Success**: `200`, `{ tenantId, clusterId, clusterName }` (`tenantId` = the
org id). Sets the cluster's `lastConnectedAt`. The gateway must compare
`clusterName` with the runner's `hello` and reject a mismatch.

**Possible handled errors**:
- `401 INVALID_RUNNER_TOKEN`: unknown, rotated or deleted token, or the org is deleted.

---

## Not built yet

- Agent runs: on/off switch, trigger rules (see `CONTEXT.md` §4.4).
- MCP servers: can be saved, but agent runs don't use them yet (see `CONTEXT.md` §4.7).