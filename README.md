# Argus SRE: Backend

This is the backend of **Argus SRE**, a platform that investigates Kubernetes incidents automatically. When an alert fires, an AI agent gathers telemetry from the cluster and writes a root cause analysis that engineers can then discuss in a chat.

This service is the system of record. It holds organizations, clusters, alert sources and incidents, it receives alerts and Clerk events through webhooks, and it starts investigations in the agent service.

## Where it fits

```
Grafana / Alertmanager ──alerts──▶ Backend ──start investigation──▶ Agent service
Clerk ─────────────user events──▶    │                                   │
Frontend ──────────REST API─────▶    │                                   ▼
                                     │◀──verify runner token── Gateway ◀── Runner (in cluster)
```

| Repo | Role |
| --- | --- |
| [argus-sre-frontend](https://github.com/argussre-thesis/argus-sre-frontend) | Web app |
| **argus-sre-backend** | API, webhooks, database |
| [argus-sre-agent-service](https://github.com/argussre-thesis/argus-sre-agent-service) | AI investigations and chat |
| [argus-sre-gateway](https://github.com/argussre-thesis/argus-sre-gateway) | Accepts runner connections |
| [argus-sre-runner](https://github.com/argussre-thesis/argus-sre-runner) | Runs inside the customer's cluster |

## What it does

**CRUD API** (`/api/v1`, Clerk auth, scoped to an organization)
- Organizations, settings, members and invitations
- Clusters, with runner tokens that can be issued and rotated
- Alert sources, each with its own webhook token
- MCP servers (extra tools for the agent)
- Incidents and their investigations: list, resolve, start an investigation, chat messages

**Webhooks**
- `POST /webhooks/v1/alerts`: receives alerts from Alertmanager or Grafana. The `Bearer` token identifies the alert source. Alerts from the same payload are grouped into one incident, and resolved alerts close it.
- `POST /api/v1/webhooks/clerk`: keeps users, organizations and memberships in sync with Clerk. It checks the Svix signature and ignores duplicate deliveries.
- `/slack/v1`: Slack OAuth install and events, used to post reports and chat in threads.

**Internal API** (`/internal/v1`, service tokens)
- Lets the gateway verify runner tokens, and lets the agent service report finished investigations and conversations.

## Tech stack

Express 5, TypeScript, Prisma 7 with PostgreSQL, Clerk, Zod, Pino, Helmet and rate limiting, Docker.

## Run locally

```bash
npm install
cp .env.example .env    # fill in the values
npm run setup-test-db   # new local database only: applies migrations and generates the client
npm run dev
```

Tests: `npm test`. Production build: `npm run build && npm start`.

See [`src/Usage.md`](src/Usage.md) for the full API reference.
