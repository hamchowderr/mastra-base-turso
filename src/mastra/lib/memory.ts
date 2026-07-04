/**
 * # Shared Memory Baseline (working memory + semantic recall enabled)
 *
 * Use this factory instead of `new Memory()` so every agent shares one memory
 * policy:
 *
 *   import { createDefaultMemory } from '../lib/memory';
 *
 *   export const myAgent = new Agent({ ..., memory: createDefaultMemory() });
 *
 * ## What's configured
 *
 *   - Message history     — ON (Mastra default). Recent turns are prepended.
 *   - Working memory      — ON, resource-scoped. A persistent Markdown scratchpad
 *                           the agent updates over time (user profile + session
 *                           state). "resource-scoped" = it persists across ALL of
 *                           a user's threads, not just one conversation.
 *   - Semantic recall     — ON, resource-scoped. Past messages are embedded and
 *                           the most relevant ones are recalled each turn. The
 *                           embedder defaults to local **fastembed** (bge-small,
 *                           384-dim, no key) and is overridable to a hosted model
 *                           via EMBEDDING_MODEL for serverless/edge — see
 *                           lib/embedder. Vectors live in libSQL/Turso (LibSQLVector).
 *
 * ## Two things to know when calling agents
 *
 * 1. Storage: this factory passes no `storage`, so Memory inherits the Mastra
 *    instance's LibSQLStore (Turso). libSQL supports the `mastra_resources` table
 *    that resource-scoped working memory requires — no extra setup needed.
 *    Semantic recall vectors use a dedicated LibSQLVector on the same database;
 *    libSQL has vector support built in (no extension to enable).
 *
 * 2. resourceId is REQUIRED for resource-scoped memory to actually persist per user:
 *
 *      await agent.generate('Hello', {
 *        memory: { thread: 'conversation-123', resource: 'user-alice-456' },
 *      });
 *
 *    Without `resource`, working memory falls back to thread-only behavior.
 *
 * Pass a custom `template` for agents that should track different fields (e.g. a
 * voice agent wants a leaner profile). See https://mastra.ai/docs/memory/working-memory
 * and https://mastra.ai/docs/memory/semantic-recall
 */

import { Memory } from '@mastra/memory';
import { LibSQLVector } from '@mastra/libsql';
import { env } from '../../lib/env';
import { embedder } from './embedder';

/** Default working-memory scratchpad. Short, focused labels per Mastra's guidance. */
export const DEFAULT_WORKING_MEMORY_TEMPLATE = `# User Profile

## Identity
- Name:
- Role / Company:

## Preferences
- Communication style: [e.g., concise, detailed]
- Constraints / things to avoid:

## Session State
- Current goal:
- Open items:
`;

/**
 * One shared LibSQLVector for semantic-recall embeddings across every agent's
 * Memory. Lazily created so importing this module never opens a connection; a
 * single instance is reused across agents on the same database.
 */
let _vector: LibSQLVector | null = null;
function memoryVector(): LibSQLVector {
  if (!_vector) {
    _vector = new LibSQLVector({
      id: 'memory-vector',
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });
  }
  return _vector;
}

/**
 * Build a Memory instance with the shared baseline. Each agent gets its own
 * instance (sharing the vector pool). Override `template` to track agent-specific
 * fields. The embedding dimension is probed from fastembed automatically — no
 * hard-coded dimension to keep in sync.
 */
export function createDefaultMemory(
  template: string = DEFAULT_WORKING_MEMORY_TEMPLATE,
): Memory {
  return new Memory({
    vector: memoryVector(),
    embedder,
    options: {
      workingMemory: {
        enabled: true,
        scope: 'resource',
        template,
      },
      semanticRecall: {
        topK: 3,
        messageRange: 2,
        scope: 'resource',
      },
    },
  });
}
