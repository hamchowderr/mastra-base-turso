import { z } from 'zod';

const boolish = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 chars'),

    // Supabase client vars are optional — only needed if you wire up the
    // Supabase auth/RLS client (NOT the framework store, which is Turso below).
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // libSQL / Turso — THE framework store (memory, threads, messages,
    // observability, and semantic-recall vectors). Local dev defaults to a file DB
    // (no cloud needed); set a libsql:// URL + TURSO_AUTH_TOKEN for Turso Cloud
    // (serverless / production).
    TURSO_DATABASE_URL: z.string().default('file:./mastra.db'),
    TURSO_AUTH_TOKEN: z.string().optional(),

    // Dolt (versioned business data) — the compose `dolt` service. Optional so
    // the app boots without Dolt; the Dolt tools error clearly if it's missing.
    DOLT_HOST: z.string().optional(),
    DOLT_PORT: z.coerce.number().int().optional(),
    DOLT_USER: z.string().optional(),
    DOLT_PASSWORD: z.string().optional(),
    DOLT_DATABASE: z.string().optional(),

    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),

    // Embedder for memory semantic recall. Empty = local fastembed (bge-small,
    // 384-dim, no key). Set to a hosted model (e.g. "openai/text-embedding-3-small")
    // for serverless/edge, where fastembed's native ONNX runtime can't run.
    EMBEDDING_MODEL: z.string().default(''),

    USE_AIMOCK: boolish.default(false),
    AIMOCK_URL: z.string().url().default('http://localhost:4010'),

    E2E_BASE_URL: z.string().url().optional(),

    MASTRA_TELEMETRY_DISABLED: z.string().optional(),
    MASTRA_CLOUD_ACCESS_TOKEN: z.string().optional(),
    // Hosted Mastra Observe (MastraPlatformExporter) — set BOTH to also ship traces.
    MASTRA_PLATFORM_ACCESS_TOKEN: z.string().optional(),
    MASTRA_PROJECT_ID: z.string().optional(),

    // Observability store defaults to libSQL/Turso. Set these to route ONLY the
    // high-volume observability domain (traces/spans) to ClickHouse — recommended
    // for production trace volume. Leave unset to keep traces in Postgres.
    CLICKHOUSE_URL: z.string().url().optional(),
    CLICKHOUSE_USERNAME: z.string().optional(),
    CLICKHOUSE_PASSWORD: z.string().optional(),

    // Shared HMAC secret for JWT auth (@mastra/auth). When set, the server
    // gates all /api/* routes AND Studio behind a Bearer JWT signed with this
    // secret. Leave unset for open local dev. Must be HS256-safe (>=32 chars).
    MASTRA_JWT_SECRET: z.string().min(32, 'MASTRA_JWT_SECRET must be at least 32 chars').optional(),
  })
  .refine(
    (e) => Boolean(e.ANTHROPIC_API_KEY || e.OPENAI_API_KEY || e.GOOGLE_GENERATIVE_AI_API_KEY),
    {
      message:
        'At least one LLM provider key required (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY)',
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n');
  for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`  ${key}: ${(errors as string[]).join(', ')}`);
  }
  for (const err of parsed.error.flatten().formErrors) {
    console.error(`  ${err}`);
  }
  console.error('\nSee .env.example for the full list of required variables.');
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
