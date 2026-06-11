/**
 * Stage 5 - Knowledge Graph ontology.
 *
 * A declarative schema that drives the graph-builder agent and the Neo4j-style
 * viewer. It defines the allowed node types (Neo4j labels), the relationship
 * types between them, default styling (colour + radius), and the base
 * confidence used when an edge of that type is created.
 *
 * Keeping this declarative means the builder, the legend, the inspector and any
 * future validator all read from one source of truth.
 */

import type { EdgeTypeId, NodeTypeId } from "./types";

export interface NodeTypeDef {
  id: NodeTypeId;
  /** Plural label used in legends. */
  plural: string;
  /** Neo4j-style fill colour. */
  color: string;
  /** Slightly darker ring colour. */
  ring: string;
  /** Base node radius in px. */
  radius: number;
}

export interface EdgeTypeDef {
  id: EdgeTypeId;
  /** Human caption used on relationships and in legends. */
  label: string;
  from: NodeTypeId[];
  to: NodeTypeId[];
  /** How the builder derives this edge. */
  derivation: "explicit" | "structural" | "inferred";
  /** Default confidence when the edge is created from an explicit source. */
  baseConfidence: number;
  color: string;
}

export const NODE_TYPES: Record<NodeTypeId, NodeTypeDef> = {
  Object: { id: "Object", plural: "Objects", color: "#2563eb", ring: "#1d4ed8", radius: 30 },
  Field: { id: "Field", plural: "Fields", color: "#0ea5e9", ring: "#0284c7", radius: 18 },
  RecordType: { id: "RecordType", plural: "Record Types", color: "#8b5cf6", ring: "#7c3aed", radius: 20 },
  Flow: { id: "Flow", plural: "Flows", color: "#10b981", ring: "#059669", radius: 22 },
  ApexClass: { id: "ApexClass", plural: "Apex Classes", color: "#f59e0b", ring: "#d97706", radius: 22 },
  PermissionSet: { id: "PermissionSet", plural: "Permission Sets", color: "#ef4444", ring: "#dc2626", radius: 22 },
  Profile: { id: "Profile", plural: "Profiles", color: "#ec4899", ring: "#db2777", radius: 22 },
};

export const EDGE_TYPES: Record<EdgeTypeId, EdgeTypeDef> = {
  HAS_FIELD: {
    id: "HAS_FIELD",
    label: "HAS_FIELD",
    from: ["Object"],
    to: ["Field"],
    derivation: "structural",
    baseConfidence: 1,
    color: "#94a3b8",
  },
  REFERENCES: {
    id: "REFERENCES",
    label: "REFERENCES",
    from: ["Field"],
    to: ["Object"],
    derivation: "explicit",
    baseConfidence: 1,
    color: "#2563eb",
  },
  RECORD_TYPE_OF: {
    id: "RECORD_TYPE_OF",
    label: "RECORD_TYPE_OF",
    from: ["RecordType"],
    to: ["Object"],
    derivation: "explicit",
    baseConfidence: 1,
    color: "#8b5cf6",
  },
  AUTOMATES: {
    id: "AUTOMATES",
    label: "AUTOMATES",
    from: ["Flow"],
    to: ["Object"],
    derivation: "inferred",
    baseConfidence: 0.5,
    color: "#10b981",
  },
  OPERATES_ON: {
    id: "OPERATES_ON",
    label: "OPERATES_ON",
    from: ["ApexClass"],
    to: ["Object"],
    derivation: "inferred",
    baseConfidence: 0.4,
    color: "#f59e0b",
  },
  GRANTS_ACCESS: {
    id: "GRANTS_ACCESS",
    label: "GRANTS_ACCESS",
    from: ["PermissionSet", "Profile"],
    to: ["Object"],
    derivation: "explicit",
    baseConfidence: 1,
    color: "#ef4444",
  },
};

export const NODE_TYPE_LIST: NodeTypeDef[] = Object.values(NODE_TYPES);
export const EDGE_TYPE_LIST: EdgeTypeDef[] = Object.values(EDGE_TYPES);
