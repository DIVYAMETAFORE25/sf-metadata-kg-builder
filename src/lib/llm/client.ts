/**
 * Frontend client for the LLM enrichment proxy (server/index.js).
 *
 * The browser never sees the OpenAI key; it only talks to our own /api routes,
 * which are served by nginx (prod) or the Vite dev proxy (dev) and forwarded to
 * the Node enrichment service.
 */

import type { ParsedMetadata } from "@/lib/parser";
import type { KnowledgeGraph, LlmRelationship } from "@/lib/graph";

export interface LlmStatus {
  llmConfigured: boolean;
  model: string;
}

export interface EnrichResult {
  relationships: LlmRelationship[];
  model: string;
  usage: Record<string, number> | null;
}

const BUSINESS_EDGE_TYPES = new Set(["AUTOMATES", "OPERATES_ON"]);

/** Ask the server whether an API key is configured (no key is ever returned). */
export async function getLlmStatus(): Promise<LlmStatus> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return { llmConfigured: false, model: "gpt-4o" };
    return (await res.json()) as LlmStatus;
  } catch {
    return { llmConfigured: false, model: "gpt-4o" };
  }
}

/**
 * Build the compact payload the server forwards to the model: the entity/flow/
 * apex inventory plus the rule engine's current business-logic candidate edges.
 */
export function buildEnrichPayload(
  metadata: ParsedMetadata,
  baseGraph: KnowledgeGraph
) {
  const objects = metadata.objects.map((o) => ({
    id: `object:${o.apiName}`,
    apiName: o.apiName,
    label: o.label,
    custom: o.custom,
  }));
  const flows = metadata.flows.map((f) => ({
    id: `flow:${f.apiName}`,
    apiName: f.apiName,
    label: f.label,
    triggerObject: f.triggerObject,
    processType: f.processType,
  }));
  const apexClasses = metadata.apexClasses.map((c) => ({
    id: `class:${c.apiName}`,
    apiName: c.apiName,
    logicCategory: c.logicCategory,
    referencedObjects: c.referencedObjects,
    businessKeywords: c.businessKeywords,
    integrationKeywords: c.integrationKeywords,
  }));

  const candidateEdges = baseGraph.edges
    .filter((e) => BUSINESS_EDGE_TYPES.has(e.type))
    .map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      confidence: e.confidence,
    }));

  return { objects, flows, apexClasses, candidateEdges };
}

/** Call the enrichment endpoint. Throws on failure so the caller can fall back. */
export async function enrichGraph(
  metadata: ParsedMetadata,
  baseGraph: KnowledgeGraph
): Promise<EnrichResult> {
  const payload = buildEnrichPayload(metadata, baseGraph);
  const res = await fetch("/api/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = `Enrichment failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }

  return (await res.json()) as EnrichResult;
}
