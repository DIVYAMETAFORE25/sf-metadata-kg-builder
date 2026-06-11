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
  | "GRANTS_ACCESS";

/** How an edge was derived from the source metadata. */
export type Derivation = "explicit" | "structural" | "inferred";

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
  /** 0..1 confidence in the link. */
  confidence: number;
  /** Human-readable justification for inferred/structural links. */
  evidence?: string;
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
    generatedAt: string;
    builderVersion: string;
  };
}
