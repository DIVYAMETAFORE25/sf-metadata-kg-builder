/**
 * Hybrid merge - blends LLM-proposed relationships into the rule-built graph.
 *
 * The deterministic rule engine (builder.ts) produces the base graph. This
 * module overlays the language model's business-logic relationships on top:
 *
 * - If the LLM confirms an edge the rules already found, the edge becomes
 *   "hybrid" and its confidence is boosted via a noisy-OR combination
 *   (agreement between two independent signals increases certainty).
 * - If the LLM proposes a brand-new edge, it is added as an "llm" edge at the
 *   model's stated confidence (capped, since it is unverified by metadata).
 * - Rule edges the LLM did not mention are left untouched (graceful fallback).
 */

import { EDGE_TYPES } from "./ontology";
import { computeStats } from "./builder";
import type { EdgeTypeId, GraphEdge, KnowledgeGraph } from "./types";

export interface LlmRelationship {
  from: string;
  to: string;
  type: string;
  confidence: number;
  rationale?: string;
}

/** Two independent signals agreeing: 1 - (1-a)(1-b). */
function noisyOr(a: number, b: number): number {
  return 1 - (1 - a) * (1 - b);
}

const LLM_EDGE_TYPES: EdgeTypeId[] = [
  "AUTOMATES",
  "OPERATES_ON",
  "BUSINESS_RELATED",
];

export function mergeLlmRelationships(
  base: KnowledgeGraph,
  relationships: LlmRelationship[]
): KnowledgeGraph {
  const nodeIds = new Set(base.nodes.map((n) => n.id));
  const edgeById = new Map<string, GraphEdge>();
  // Clone edges so the base graph stays immutable.
  for (const e of base.edges) edgeById.set(e.id, { ...e });

  for (const rel of relationships) {
    const type = rel.type as EdgeTypeId;
    if (!LLM_EDGE_TYPES.includes(type)) continue;
    if (!nodeIds.has(rel.from) || !nodeIds.has(rel.to)) continue;
    if (rel.from === rel.to) continue;

    const id = `${rel.from}|${type}|${rel.to}`;
    const llmConfidence = Math.max(0, Math.min(1, rel.confidence));
    const existing = edgeById.get(id);

    if (existing) {
      const ruleConfidence = existing.confidence;
      // Explicit metadata facts are already certain; agreement keeps them at 1.
      const blended =
        existing.derivation === "explicit" || existing.derivation === "structural"
          ? existing.confidence
          : Number(Math.min(0.99, noisyOr(ruleConfidence, llmConfidence)).toFixed(2));
      edgeById.set(id, {
        ...existing,
        derivation: "hybrid",
        ruleConfidence,
        llmConfidence,
        confidence: blended,
        rationale: rel.rationale,
      });
    } else {
      const def = EDGE_TYPES[type];
      edgeById.set(id, {
        id,
        type,
        source: rel.from,
        target: rel.to,
        caption: def.label,
        derivation: "llm",
        // Unverified by metadata: cap so it never outranks a confirmed link.
        confidence: Number(Math.min(0.9, llmConfidence).toFixed(2)),
        llmConfidence,
        rationale: rel.rationale,
      });
    }
  }

  const edges = Array.from(edgeById.values());
  return {
    nodes: base.nodes,
    edges,
    stats: computeStats(base.nodes, edges),
  };
}
