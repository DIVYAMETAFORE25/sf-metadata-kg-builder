/**
 * Stage 5 - Knowledge Graph type contracts.
 *
 * A small, framework-neutral graph model produced by the graph-builder agent
 * from Stage 1 parsed metadata. Nodes and edges are typed against the ontology
 * (see ontology.ts) and carry provenance + confidence so later stages (the
 * graph validator and BRD generator) can reason about how each link was
 * derived.
 */

export type NodeTypeId =
  | "Object"
  | "Field"
  | "RecordType"
  | "Flow"
  | "ApexClass"
  | "PermissionSet"
  | "Profile";

export type EdgeTypeId =
  | "HAS_FIELD"
  | "REFERENCES"
  | "RECORD_TYPE_OF"
  | "AUTOMATES"
  | "OPERATES_ON"
  | "GRANTS_ACCESS"
  | "BUSINESS_RELATED";

/**
 * How an edge was derived:
 * - explicit:   declared directly in metadata (e.g. a Lookup referenceTo)
 * - structural: a structural fact from the file layout (e.g. object HAS_FIELD)
 * - inferred:   derived by the deterministic rule engine (name/keyword match)
 * - llm:        proposed solely by the language model
 * - hybrid:     agreed on by BOTH the rule engine and the language model
 */
export type Derivation = "explicit" | "structural" | "inferred" | "llm" | "hybrid";

export interface GraphNode {
  /** Stable id, e.g. "object:Account" (reuses the parsed artifact id). */
  id: string;
  /** Ontology node type / Neo4j label. */
  type: NodeTypeId;
  /** Primary caption shown inside the node. */
  label: string;
  /** Arbitrary property bag shown in the inspector. */
  properties: Record<string, unknown>;
  /** Source file the artifact came from, when known. */
  sourcePath?: string;
}

export interface GraphEdge {
  id: string;
  /** Relationship type / Neo4j edge label. */
  type: EdgeTypeId;
  source: string;
  target: string;
  /** Short caption shown on the relationship. */
  caption?: string;
  derivation: Derivation;
  /** 0..1 blended confidence in the link (shown in the UI). */
  confidence: number;
  /** Confidence contributed by the deterministic rule engine, when applicable. */
  ruleConfidence?: number;
  /** Confidence assigned by the language model, when applicable. */
  llmConfidence?: number;
  /** Human-readable justification for inferred/structural links. */
  evidence?: string;
  /** Natural-language rationale from the language model. */
  rationale?: string;
  properties?: Record<string, unknown>;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<NodeTypeId, number>;
    edgesByType: Record<EdgeTypeId, number>;
    inferredEdgeCount: number;
    /** Edges proposed solely by the LLM. */
    llmEdgeCount: number;
    /** Edges agreed on by both the rule engine and the LLM. */
    hybridEdgeCount: number;
    /** Mean confidence across all edges (0..1). */
    avgConfidence: number;
    /** Whether LLM enrichment has been merged into this graph. */
    enriched: boolean;
    generatedAt: string;
    builderVersion: string;
  };
}
