import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { LeadSchema, type Lead } from '../agents/_example';

/**
 * # Lead Routing Workflow (canonical example)
 *
 * What it does:
 *   1. extract-lead — runs the leadIntake agent on the raw message and gets a
 *      LeadSchema object back (structured output, not free text).
 *   2. route-lead   — plain TypeScript, no LLM: picks a queue, a priority and a
 *      follow-up SLA from the extracted intent and urgency.
 *
 * Agent for the fuzzy part, deterministic code for the business rule: the
 * routing table below is the piece you edit per client.
 *
 * How to run:
 *   curl -X POST 'http://localhost:4111/api/workflows/leadRouting/start-async' \
 *     -H 'Content-Type: application/json' \
 *     -d '{"inputData":{"message":"Hi, this is John Smith from Acme Corp (john@acme.io). We need pricing for 50 seats by Friday."}}'
 *
 * Or open Workflows → leadRouting in Studio.
 */

export const LeadRoutingInputSchema = z.object({
  message: z.string().min(1).describe('Raw inbound text: email body, transcript or form submission'),
});

export const RoutedLeadSchema = z.object({
  lead: LeadSchema,
  queue: z.enum(['sales', 'support', 'partnerships', 'triage']),
  priority: z.enum(['p1', 'p2', 'p3']),
  followUpWithinHours: z.number().int().positive(),
});

export type RoutedLead = z.infer<typeof RoutedLeadSchema>;

const QUEUE_BY_INTENT: Record<Lead['intent'], RoutedLead['queue']> = {
  demo: 'sales',
  pricing: 'sales',
  support: 'support',
  partnership: 'partnerships',
  other: 'triage',
};

const SLA_BY_URGENCY: Record<Lead['urgency'], { priority: RoutedLead['priority']; hours: number }> = {
  high: { priority: 'p1', hours: 1 },
  medium: { priority: 'p2', hours: 24 },
  low: { priority: 'p3', hours: 72 },
};

/** The routing rule on its own, so it can be reused or tested without an LLM. */
export function routeLead(lead: Lead): RoutedLead {
  const sla = SLA_BY_URGENCY[lead.urgency];
  return {
    lead,
    queue: QUEUE_BY_INTENT[lead.intent],
    priority: sla.priority,
    followUpWithinHours: sla.hours,
  };
}

const extractLead = createStep({
  id: 'extract-lead',
  description: 'Run the leadIntake agent on the raw message and return structured lead data',
  inputSchema: LeadRoutingInputSchema,
  outputSchema: LeadSchema,
  execute: async ({ inputData, mastra }) => {
    // Resolve through the Mastra instance so the registered agent (memory,
    // storage, observability, editor overrides) is the one that runs.
    const agent = mastra.getAgent('leadIntake');
    const result = await agent.generate(inputData.message, {
      structuredOutput: { schema: LeadSchema },
    });
    return LeadSchema.parse(result.object);
  },
});

const routeLeadStep = createStep({
  id: 'route-lead',
  description: 'Map intent and urgency to a queue, priority and follow-up SLA',
  inputSchema: LeadSchema,
  outputSchema: RoutedLeadSchema,
  execute: async ({ inputData }) => routeLead(inputData),
});

export const leadRoutingWorkflow = createWorkflow({
  id: 'leadRouting',
  description: 'Extracts a lead from raw text with the leadIntake agent, then routes it to a queue with a priority and SLA.',
  inputSchema: LeadRoutingInputSchema,
  outputSchema: RoutedLeadSchema,
})
  .then(extractLead)
  .then(routeLeadStep)
  .commit();
