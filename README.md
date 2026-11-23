# Minimum Working Backend

This repository is a minimum working backend starter for building a modern product API. It supports authenticated user flows such as logout and basic profile handling, while signup and login are handled by Clerk from the frontend. The project follows a clean and scalable structure with reusable patterns such as validation, a response handler, a centralized error handler, Prisma for database access, and Clerk for authentication.

It is meant to be a solid MVP-style foundation that you can clone, extend, and customize for your own product.

## Tech Stack

- **Express.js** for the API server
- **Clerk** for authentication (`@clerk/express`)
- **Prisma** with PostgreSQL
- **Pino** for structured HTTP and application logging
- **Zod** for boot-time environment validation and request schema validation
- **Helmet & Rate Limit** for out-of-the-box API security
- **Docker** with a multi-stage `Dockerfile` ready for production

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with the required environment variables:
   - `PORT` (defaults to 5000)
   - `DATABASE_URL`
   - `FRONTEND_URL`
   - `CLERK_SECRET_KEY`
   - `CLERK_WEBHOOK_SECRET`
   - `NODE_ENV` (required: `development`, `staging` or `production`; raw error messages are only sent in `development`)
   - `LOG_LEVEL` (`info`, `debug`, etc.)

3. Set up Clerk first and configure your application there.

4. Set up a PostgreSQL database and provide the connection string in `DATABASE_URL`.

   Prisma needs a reachable PostgreSQL server and a valid `DATABASE_URL`. It can
   create tables in an empty database, but it does not install or start PostgreSQL.
   Creating the empty database yourself is the most reliable option; if the named
   database does not exist, the database user must have permission to create it.

## First-time database setup

### Local or test database

Use this when starting with a new, empty local/test database:

```bash
npm run setup-test-db
```

This command runs:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

It creates the initial migration when one does not exist, applies all migrations
to the database, and generates Prisma Client. Commit the resulting
`src/prisma/migrations` directory so the same database structure can be applied
to test, staging, and production.

Do not run `setup-test-db` with a production `DATABASE_URL`. `migrate dev` is a
development command and can ask to reset a database when it detects drift.

### Production database

Before initializing production, create and commit the migrations using a
local/test database as described above. Then set `DATABASE_URL` to the production
database and run:

```bash
npm run setup-prod-db
```

This runs `prisma migrate deploy` to apply the committed migrations, followed by
`prisma generate`. It does not create migration files or reset the database.

## Run the app

After running the database setup, start development normally:

```bash
npm run dev
```

If the database is already initialized but Prisma Client has not been generated
(for example, immediately after cloning the repository), use:

```bash
npm run dev-first
```

`dev-first` only generates Prisma Client and starts the server. It does not create
or update database tables.

- Build for production:
  ```bash
  npm run build
  ```

- Start a built application:
  ```bash
  npm start
  ```

## Clerk webhook synchronization

The public Clerk webhook receiver is:

```text
POST /api/v1/webhooks/clerk
```

It verifies Clerk's signature before processing an event, deduplicates deliveries by
the `svix-id` header, and synchronizes local users, organizations, and memberships.
Configure the Clerk webhook endpoint to send these events:

- `user.created`, `user.updated`, `user.deleted`
- `organization.created`, `organization.updated`, `organization.deleted`
- `organizationMembership.created`, `organizationMembership.updated`,
  `organizationMembership.deleted`

Set the endpoint's signing secret as `CLERK_WEBHOOK_SECRET`. The endpoint must
be reachable from Clerk, so local development will require Clerk's webhook forwarding
or another HTTPS tunnel. Apply the Prisma migrations before delivering signed events.

## Database (Prisma) commands

Prisma keeps three related things in sync:

1. `src/prisma/schema.prisma` describes the models the application expects.
2. `src/prisma/migrations` contains the SQL history used to build/update databases.
3. `src/prisma/generated/prisma` contains the generated client and TypeScript types
   used by the application.

`prisma generate` updates generated application code; it does not change the
database. Migration commands update the database; with Prisma 7 they do not
automatically regenerate Prisma Client, so this template runs `generate`
explicitly where it is needed.

All Prisma commands operate against the `DATABASE_URL` currently loaded from
`.env`. There are not separate test and production configuration files, so always
check the active URL before running a database command.

| npm command | Use it when | What it does |
| --- | --- | --- |
| `npm run setup-test-db` | First local/test setup | Creates/applies the initial development migration and generates Prisma Client. |
| `npm run setup-prod-db` | First production setup | Applies existing committed migrations and generates Prisma Client. |
| `npm run update-test-db` | After editing `schema.prisma` locally | Creates/applies a new migration and regenerates Prisma Client. |
| `npm run update-prod-db` | Deploying committed schema changes | Applies pending committed migrations only. The production build already generates Prisma Client. |
| `npm run dev-first` | Client is missing, but the database is already ready | Generates Prisma Client and starts the development server. |
| `npm run build` | Creating a production build | Generates Prisma Client and compiles TypeScript. |

### Normal schema-change workflow

1. Edit `src/prisma/schema.prisma`.
2. Verify that `DATABASE_URL` points to your local/test database.
3. Run `npm run update-test-db`.
4. Review and commit the new directory under `src/prisma/migrations`.
5. Build the application with `npm run build`.
6. In the deployment environment, run `npm run update-prod-db` before starting
   the new application version.

Never edit or delete a migration that has already been applied to a shared or
production database. Create a new migration instead.

If connecting Prisma to an existing populated database rather than a new empty
one, do not run the initial setup blindly. Introspect it with `npx prisma db pull`
and baseline the existing schema before adopting Prisma Migrate.

## Notes

Checkout src/Usage.md to see API behaviour and validation patterns.
