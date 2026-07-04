import { fastembed } from '@mastra/fastembed';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

import { env } from '../../lib/env';

/**
 * Shared embedder for memory semantic recall — the single knob for embeddings in
 * this template.
 *
 * Default: local **fastembed** (bge-small-en-v1.5, 384-dim) — no API key, no
 * spend, deterministic. But it's a native ONNX binding (glibc), so it does NOT
 * run on Cloudflare Workers / edge and is heavy on Vercel/Netlify cold starts.
 *
 * Serverless/edge: set `EMBEDDING_MODEL` to a hosted model
 * (e.g. "openai/text-embedding-3-small") and recall switches to that API embedder.
 * Memory probes the embedding dimension automatically, so no dimension to set here.
 */
export const embedder = env.EMBEDDING_MODEL
  ? new ModelRouterEmbeddingModel(env.EMBEDDING_MODEL)
  : fastembed;
