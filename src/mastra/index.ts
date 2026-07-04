// 1. Env validation FIRST — crashes process if misconfigured
import { env } from '../lib/env';

// 2. AIMock provider switch — must run before any AI SDK client constructs
import { configureAIMock } from './lib/aimock';
configureAIMock();

// 3. Mastra imports — agents/tools constructed below now see the right base URLs
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { MastraCompositeStore } from '@mastra/core/storage';
import { ObservabilityStorageClickhouseVNext } from '@mastra/clickhouse';
import { Observability, DefaultExporter, SensitiveDataFilter, MastraPlatformExporter } from '@mastra/observability';
import { MastraEditor } from '@mastra/editor';
import { MCPServer } from '@mastra/mcp';
import { MastraJwtAuth } from '@mastra/auth';
import { leadIntakeAgent } from './agents/_example';
import { hallucinationScorer, promptAlignmentScorer, urgencyScorer } from './scorers/_example.scorers';
import { doltTools } from './tools/dolt';
import { ensureDatabase, doltConfigured } from './lib/dolt';

// Bootstrap the versioned Dolt database on first boot (no-op if Dolt isn't configured).
if (doltConfigured) {
  await ensureDatabase();
}

const mcpServer = new MCPServer({
  id: 'base-mcp',
  name: 'template-mastra-base',
  version: '0.1.0',
  description: 'MCP server exposing template-mastra-base agents + Dolt tools',
  // Dolt versioned-data tools exposed over MCP. To let the example agent call
  // them directly, spread `...doltTools` into the agent's own `tools`.
  tools: { ...doltTools },
  agents: { leadIntake: leadIntakeAgent },
});

// One shared libSQL/Turso store for ALL domains (memory, editor, observability
// traces, scores). Local dev uses a file DB (zero setup); Turso Cloud (libsql://
// URL + token) for serverless/production. A single instance is reused everywhere.
const libsqlStore = new LibSQLStore({
  id: 'mastra-storage',
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

// Storage: libSQL/Turso for everything by default — one DB, serverless-friendly
// (Turso Cloud) and zero-setup locally (a file DB). For high-volume production
// observability, set CLICKHOUSE_* to route ONLY the observability domain (hundreds
// of spans per interaction) to ClickHouse while memory/editor/etc. stay in Turso.
const storage = env.CLICKHOUSE_URL
  ? new MastraCompositeStore({
      id: 'composite-storage',
      default: libsqlStore,
      domains: {
        observability: new ObservabilityStorageClickhouseVNext({
          url: env.CLICKHOUSE_URL,
          username: env.CLICKHOUSE_USERNAME ?? 'default',
          password: env.CLICKHOUSE_PASSWORD ?? '',
        }),
      },
    })
  : libsqlStore;

// JWT auth: when MASTRA_JWT_SECRET is set, gate all /api/* routes AND Studio
// behind a Bearer JWT signed with the shared secret. `/health` and `/api/auth/*`
// stay public (so healthchecks and the Studio login screen still work). Leave
// the secret unset for open local dev. Shared-secret only — no external provider.
// NB: name this `serverConfig`, not `server` — `mastra dev`'s generated entry
// declares its own top-level `server`, which collides in the bundler ("symbol
// 'server' has already been declared"). `mastra build` doesn't hit it.
const serverConfig = env.MASTRA_JWT_SECRET
  ? { auth: new MastraJwtAuth({ secret: env.MASTRA_JWT_SECRET }) }
  : undefined;

export const mastra = new Mastra({
  ...(serverConfig ? { server: serverConfig } : {}),
  agents: { leadIntake: leadIntakeAgent },
  scorers: { hallucinationScorer, promptAlignmentScorer, urgencyScorer },
  mcpServers: { baseMcp: mcpServer },
  storage,
  logger: new PinoLogger({
    name: 'Mastra',
    level: env.LOG_LEVEL,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        // Local traces always; also ship to hosted Mastra Observe when creds are set
        // (MASTRA_PLATFORM_ACCESS_TOKEN + MASTRA_PROJECT_ID) — no-op otherwise.
        exporters: [
          new DefaultExporter(),
          ...(process.env.MASTRA_PLATFORM_ACCESS_TOKEN && process.env.MASTRA_PROJECT_ID
            ? [new MastraPlatformExporter()]
            : []),
        ],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  editor: new MastraEditor(),
});
