# mastra-base-turso

A production-minded Mastra agent starter that runs with **no Docker and no database server**: storage is libSQL, which is a local file in development and Turso Cloud in production.

## Overview

This template gives you one working example of each Mastra primitive, wired the way a real deployment needs them:

- **Agent**: `leadIntake` turns unstructured text (an email, a call transcript, a form post) into a typed lead object (`LeadSchema`). It uses an inline tool, working memory, semantic recall, input/output processors and live scorers.
- **Workflow**: `leadRouting` runs `leadIntake` with structured output, then routes the lead to a queue with a priority and follow-up SLA using plain TypeScript rules.
- **Scorers and evals**: hallucination, prompt-alignment and urgency scorers, a 5-case dataset, and `npm run eval`, a CI gate that exits non-zero on regressions. It runs free and deterministically against [AIMock](https://github.com/CopilotKit/aimock).
- **Storage**: one `LibSQLStore` for memory, threads, editor versions, scores and traces. Semantic-recall vectors live in the same database. Leave `TURSO_*` blank and it uses `file:./mastra.db` with zero setup.
- **Any provider**: the `MODEL` env var picks the model, so Anthropic, OpenAI and Google all work without code changes.
- **Reachability**: every agent is callable over REST, A2A and MCP, and in Mastra Studio, out of the box.
- **Extras, all optional**: JWT auth for the API and Studio, a Dolt ledger for versioned business data, ClickHouse for high-volume traces, hosted Mastra Observe, and a Docker image.

This is the libSQL/Turso sibling of [mastra-base](https://github.com/hamchowderr/mastra-base), which uses Postgres. Pick this variant for low-friction local development, serverless or edge deploys, or one isolated database per agent.

### File structure

```
src/
├── lib/
│   └── env.ts                    # Zod-validated env; exits on bad config
└── mastra/
    ├── index.ts                  # Entry point: env → AIMock → Mastra instance
    ├── agents/
    │   └── _example.ts           # leadIntake agent; copy this for new agents
    ├── workflows/
    │   └── lead-routing.ts       # leadRouting workflow (agent step + rules step)
    ├── tools/
    │   └── dolt.ts               # Shared Dolt tools (exposed over MCP)
    ├── scorers/
    │   ├── _example.scorers.ts   # hallucination, prompt-alignment, urgency
    │   └── datasets/_example.json# Eval dataset: 5 cases + thresholds
    └── lib/
        ├── aimock.ts             # Routes LLM calls to AIMock when USE_AIMOCK=true
        ├── memory.ts             # Shared memory policy (working memory + recall)
        ├── embedder.ts           # fastembed locally, or a hosted embedder
        ├── processors.ts         # Shared input/output processor baseline
        └── dolt.ts               # Dolt connection + bootstrap
scripts/
├── eval.ts                       # Offline eval gate; exits 0/1 on thresholds
└── bake-studio.mjs               # Bakes Studio config into the Docker build
prompts/build-agent.md            # Prompt for generating a new agent with an AI assistant
fixtures/lead-intake.json         # AIMock fixtures for the eval dataset
.github/workflows/ci.yml          # typecheck → build + eval → docker
Dockerfile, docker-compose.yml    # Production image + compose (with Dolt)
AGENTS.md                         # Conventions for AI coding agents
```

## Setup

**Prerequisites**: Node 22.13 or newer, and an API key for one of Anthropic, OpenAI or Google. You don't need Docker, Postgres or Supabase.

```bash
npm install
cp .env.example .env
```

Edit `.env` and set two things:

1. `APP_SECRET`: at least 32 characters. Generate one with `openssl rand -hex 32`.
2. One provider key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`. If it isn't Anthropic, also set `MODEL` (see [Environment Variables](#environment-variables)).

Then start the dev server:

```bash
npm run dev
# → Studio at http://localhost:4111, API at http://localhost:4111/api
```

Leave `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` blank. Storage is then a local libSQL file created on first boot, resolved against the working directory: `src/mastra/public/mastra.db` under `npm run dev`, `./mastra.db` for `npm run eval`. Both are gitignored. The first message that uses semantic recall downloads the local fastembed model (bge-small) once.

To check that everything works, open Studio, pick the `leadIntake` agent, and send:

> Hi, this is John Smith from Acme Corp (john@acme.io). We need pricing for 50 seats by Friday.

You should get back a JSON lead with every field filled in and `"urgency": "high"`.

## Environment Variables

`src/lib/env.ts` validates everything at boot and lists each problem before it exits. `.env.example` documents every variable.

**Required**

| Variable | Notes |
|---|---|
| `APP_SECRET` | At least 32 characters. `openssl rand -hex 32` |
| One of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | Set the one that matches `MODEL`'s provider. Not needed when `USE_AIMOCK=true` |

**Model**

| Variable | Default | Notes |
|---|---|---|
| `MODEL` | `anthropic/claude-sonnet-4-6` | A Mastra model-router string, `provider/model-id`. Used by the agent, the workflow and the scorer judges. Examples: `openai/gpt-5.5`, `google/gemini-3.5-flash` |

**Storage** (all optional)

| Variable | Default | Notes |
|---|---|---|
| `TURSO_DATABASE_URL` | `file:./mastra.db` | Blank means a local file DB, relative to the working directory (`src/mastra/public/` under `mastra dev`). Set `libsql://<db>.turso.io` for Turso Cloud |
| `TURSO_AUTH_TOKEN` | none | Required with a Turso Cloud URL |
| `EMBEDDING_MODEL` | local fastembed | Hosted embedder for semantic recall, e.g. `openai/text-embedding-3-small`. Use it on serverless/edge, where fastembed's native runtime can't load |
| `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD` | none | Route only observability traces to ClickHouse |

**Optional integrations**

| Variable | Notes |
|---|---|
| `MASTRA_JWT_SECRET` | When set, every `/api/*` route and Studio require a Bearer JWT (HS256) signed with this secret. `/health` stays public |
| `DOLT_HOST`, `DOLT_PORT`, `DOLT_USER`, `DOLT_PASSWORD`, `DOLT_DATABASE` | Dolt ledger for the Dolt tools. The app boots without it |
| `MASTRA_PLATFORM_ACCESS_TOKEN` + `MASTRA_PROJECT_ID` | Also ship traces to hosted Mastra Observe |
| `USE_AIMOCK`, `AIMOCK_URL` | Route every provider call to AIMock (default `http://localhost:4010`) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Only if you add a Supabase auth/RLS client yourself. Mastra does not store anything in Supabase |
| `LOG_LEVEL`, `NODE_ENV`, `MASTRA_TELEMETRY_DISABLED` | Standard runtime switches |

## Usage

### Studio

Open `http://localhost:4111`. Studio gives you:

- chat with each agent, and a runner for each workflow
- a trace for every run
- a metrics dashboard covering cost, latency and errors
- the **Agent Editor**, where product teams and prompt engineers can change an agent's instructions, prompts and tools without a deploy. Changes are versioned with a draft/publish flow. On code-defined agents, `id`, `name` and `model` are read-only.

Before you expose Studio publicly, set `MASTRA_JWT_SECRET`.

### REST API

```bash
curl -X POST http://localhost:4111/api/agents/leadIntake/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hi, I need a quote"}]}'
```

For a streaming response, call `/stream` instead of `/generate`. The OpenAPI spec is at `/api/openapi.json`, and interactive docs are at `/swagger-ui` in development.

**Working memory.** Memory is resource-scoped (see `src/mastra/lib/memory.ts`). To keep context across a user's conversations, pass a stable user ID as `memory.resource` and the conversation ID as `memory.thread`:

```bash
curl -X POST http://localhost:4111/api/agents/leadIntake/generate \
  -H "Content-Type: application/json" \
  -d '{
    "messages":[{"role":"user","content":"Hi, I need a quote"}],
    "memory":{"resource":"user-alice-456","thread":"conversation-123"}
  }'
```

If you leave out `memory.resource`, memory only lasts for the thread. Both working memory and semantic-recall vectors are stored in libSQL, which needs no extra setup.

### Workflow

```bash
curl -X POST http://localhost:4111/api/workflows/leadRouting/start-async \
  -H "Content-Type: application/json" \
  -d '{"inputData":{"message":"Hi, this is John Smith from Acme Corp (john@acme.io). We need pricing for 50 seats by Friday."}}'
```

`result` holds the extracted `lead` plus `queue` (`sales`), `priority` (`p1`) and `followUpWithinHours` (`1`).

### A2A (Agent-to-Agent protocol)

```bash
# Agent card
curl http://localhost:4111/api/.well-known/leadIntake/agent-card.json

# Send a message (JSON-RPC)
curl -X POST http://localhost:4111/api/a2a/leadIntake \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"kind":"message","messageId":"msg-1","role":"user","parts":[{"kind":"text","text":"Hi, I need a quote"}]}}}'
```

Always include the `/api` prefix. A bare `/a2a/...` path is caught by Studio's router and returns HTML.

### MCP

The `MCPServer` serves every agent as a tool named `ask_<agentId>`, plus the Dolt tools, at `http://localhost:4111/api/mcp/base-mcp/mcp`.

`@mastra/mcp` is **2.x**, and 2.x serves **only MCP protocol revision `2026-07-28`**. That revision is stateless: there is no `initialize` handshake, and every request carries an `MCP-Protocol-Version` header and a `_meta` envelope. A client on an older revision gets `-32022 Unsupported protocol version`. Connect with a client that speaks 2026-07-28, such as `MCPClient` from `@mastra/mcp` 2.x:

```ts
import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  servers: { base: { url: new URL('http://localhost:4111/api/mcp/base-mcp/mcp') } },
});
console.log(Object.keys(await mcp.listTools())); // base_ask_leadIntake, base_doltQuery, ...
```

If an IDE or desktop client only speaks an older revision, it can't connect until it adds support for 2026-07-28.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server + Studio on :4111 (long-running) |
| `npm run build` | Production bundle in `.mastra/output/` |
| `npm run start` | Run the production bundle |
| `npm run typecheck` | `tsc --noEmit` over `src/` and `scripts/` |
| `npm run eval` | Eval gate over the dataset; exits 0 on pass, 1 on fail |
| `npm run score:list` | List registered scorers |

### Evals

```bash
# Free and deterministic: AIMock answers from fixtures/lead-intake.json
npx -y -p @copilotkit/aimock aimock -c aimock.json   # terminal 1
USE_AIMOCK=true npm run eval                         # terminal 2

# Against the real provider for MODEL (this bills your key)
npm run eval

# Custom dataset
node --env-file=.env --import tsx/esm scripts/eval.ts path/to/dataset.json
```

AIMock intercepts all three providers, because Mastra's model router reads `<PROVIDER>_BASE_URL` on every call and `configureAIMock()` sets those variables. Under AIMock the LLM-judged scorers report `n/a` and are skipped. The field checks still gate the run. CI runs this path.

### Docker

```bash
docker build -t my-agent:latest .
docker compose up -d          # app + a Dolt sql-server; set DOLT_PASSWORD in .env
curl http://localhost:4111/health
```

Inside a container, a blank `TURSO_DATABASE_URL` writes `mastra.db` to the container's filesystem, which is lost when the container is recreated. For anything that must persist, set a Turso Cloud URL and token, or mount a volume and point `TURSO_DATABASE_URL` at it.

## Customization

### Switch the model or provider

Set `MODEL` in `.env`, and set that provider's key:

```bash
MODEL=openai/gpt-5.5
OPENAI_API_KEY=sk-...
```

Any provider the Mastra model router supports works. If one agent needs its own model, hard-code a router string on that agent only.

### Add an agent

1. Copy `src/mastra/agents/_example.ts` to `src/mastra/agents/my-agent.ts`. Change `id`, `name`, `description`, `instructions`, the tools and the output schema.
2. Register the agent in `src/mastra/index.ts`, both under `agents` on the `Mastra` instance and under `agents` on the `MCPServer`. The MCP server won't start if an agent has no `description`.
3. Add a dataset in `src/mastra/scorers/datasets/`: at least 5 cases, including one anti-hallucination case. Add matching AIMock fixtures.
4. Or let an AI assistant do it: fill in `prompts/build-agent.md` and give it to Claude Code.

### Add a workflow

Copy `src/mastra/workflows/lead-routing.ts`. Steps are built with `createStep` and Zod input/output schemas, and chained with `createWorkflow(...).then(...).commit()`. Register the workflow under `workflows` in `src/mastra/index.ts`. Inside a step, resolve agents with `mastra.getAgent('<key>')`, so the registered agent with its memory and observability is the one that runs.

### Storage

- **Turso Cloud**: set `TURSO_DATABASE_URL=libsql://…` and `TURSO_AUTH_TOKEN`. Use it for anything serverless, where the filesystem is ephemeral. Turso makes one database per agent or per tenant cheap.
- **ClickHouse for traces**: set `CLICKHOUSE_*`. A `MastraCompositeStore` then sends only the observability domain to ClickHouse, and everything else stays in libSQL.
- **Hosted embeddings**: set `EMBEDDING_MODEL` (e.g. `openai/text-embedding-3-small`) when the runtime can't load fastembed's native ONNX binding (serverless or edge). Vectors stay in libSQL.

### Auth

Set `MASTRA_JWT_SECRET` (at least 32 characters) to put the API and Studio behind HS256 Bearer JWTs. Mint a token:

```bash
node -e "import('jsonwebtoken').then(j=>console.log(j.default.sign({sub:'client'},process.env.MASTRA_JWT_SECRET)))"
```

To use it in Studio, go to Settings → Headers and add `Authorization: Bearer <jwt>`.

### Safety processors

`src/mastra/lib/processors.ts` turns on `UnicodeNormalizer` and `TokenLimiter` for every agent. The model-backed guardrails (moderation, prompt injection, PII and others) are opt-in, because each one adds an LLM call per request.

### Deployment notes

- **Docker image**: the image is built on `node:22-slim` (Debian, glibc), not Alpine, because fastembed's `onnxruntime-node` binding won't load on musl. That puts the image at roughly 676MB. To slim it down, set `EMBEDDING_MODEL` to a hosted embedder first.
- **Serverless**: `@mastra/deployer-vercel`, `-netlify` and `-cloudflare` are installed as dev dependencies. On those platforms use Turso Cloud and a hosted `EMBEDDING_MODEL`. A local `file:` DB and fastembed both assume a persistent Node host.

### Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid environment variables` on boot | Missing or malformed `.env` | Fix each variable the error lists. Compare with `.env.example` |
| `At least one LLM provider key required` | No provider key set | Set the key for `MODEL`'s provider, or `USE_AIMOCK=true` |
| `Could not find API key process.env.X for model id …` | `MODEL` names a provider whose key isn't set | Set that provider's key, or change `MODEL` |
| MCP client gets `-32022 Unsupported protocol version` | The client speaks an MCP revision older than 2026-07-28 | Use a 2026-07-28 client (see [MCP](#mcp)) |
| Data gone after a redeploy | `file:` DB on an ephemeral filesystem | Use Turso Cloud, or mount a volume |
| Container won't load native modules | musl-based image | Stay on `node:22-slim` |
| Agent not listed in Studio | Not registered on the Mastra instance | Add it to `agents` in `src/mastra/index.ts` |
| Storage init error about a missing `id` | `LibSQLStore` requires `id` | Pass `id: 'mastra-storage'` |
| PostHog telemetry noise on locked-down networks | Mastra phones home at startup | `MASTRA_TELEMETRY_DISABLED=1` |
| `npm install` fails downloading onnxruntime | Network blocks the ONNX binary download | `ONNXRUNTIME_NODE_INSTALL=skip npm install`, then set a hosted `EMBEDDING_MODEL` |

### For AI coding agents

`AGENTS.md` has the conventions: boot order (env → AIMock → Mastra), import rules, env rules, agent/workflow/scorer layout, storage, and the list of things never to do. `CLAUDE.md` gives Claude Code a short version and points to it.
