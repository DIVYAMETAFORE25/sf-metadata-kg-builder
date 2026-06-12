/**
 * Stage 5 - Knowledge Graph builder agent.
 *
 * Transforms Stage 1 `ParsedMetadata` into an ontology-typed knowledge graph
 * of nodes and edges. Explicit and structural relationships (fields, lookups,
 * record types) are emitted with full confidence; flow/apex -> object links are
 * inferred from trigger metadata, referenced objects, names and business
 * keywords, and carry a lower confidence plus a human-readable evidence string.
 */

import type {
  ParsedApexClass,
  ParsedFlow,
  ParsedMetadata,
  ParsedObject,
} from "@/lib/parser";
import { EDGE_TYPES } from "./ontology";
import type {
  EdgeTypeId,
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  NodeTypeId,
} from "./types";

export const GRAPH_BUILDER_VERSION = "1.0.0";

export interface BuildGraphOptions {
  /** Include Field nodes + HAS_FIELD edges (can be large). Default true. */
  includeFields?: boolean;
  /** Include Flow nodes + AUTOMATES edges. Default true. */
  includeFlows?: boolean;
  /** Include ApexClass nodes + OPERATES_ON edges. Default true. */
  includeApex?: boolean;
  /** Include RecordType nodes + RECORD_TYPE_OF edges. Default true. */
  includeRecordTypes?: boolean;
  /** Include PermissionSet/Profile nodes + GRANTS_ACCESS edges. Default true. */
  includeSecurity?: boolean;
}

const DEFAULTS: Required<BuildGraphOptions> = {
  includeFields: true,
  includeFlows: true,
  includeApex: true,
  includeRecordTypes: true,
  includeSecurity: true,
};

/** Normalise an api/label name into comparable lowercase tokens. */
function tokenize(value: string): string[] {
  return value
    .replace(/__c$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

/** Build a lookup of object api name -> singular comparable tokens. */
function objectTokenIndex(objects: ParsedObject[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const obj of objects) {
    const tokens = new Set<string>(tokenize(obj.apiName));
    if (obj.label) tokenize(obj.label).forEach((t) => tokens.add(t));
    index.set(obj.apiName, tokens);
  }
  return index;
}

/**
 * Infer which object a flow/apex artifact most likely acts on, using its name
 * and business keywords against object tokens. Returns the best match plus a
 * confidence in [0,1] and an evidence string, or null when nothing matches.
 */
function inferObjectMatch(
  sourceTokens: Set<string>,
  objectIndex: Map<string, Set<string>>,
  baseConfidence: number
): { object: string; confidence: number; evidence: string } | null {
  let best: { object: string; overlap: number } | null = null;
  for (const [objApiName, objTokens] of objectIndex) {
    let overlap = 0;
    for (const t of sourceTokens) {
      if (objTokens.has(t)) overlap += 1;
    }
    if (overlap > 0 && (!best || overlap > best.overlap)) {
      best = { object: objApiName, overlap };
    }
  }
  if (!best) return null;
  // More overlapping tokens -> higher confidence, capped at a sensible ceiling.
  const confidence = Math.min(0.85, baseConfidence + (best.overlap - 1) * 0.15);
  return {
    object: best.object,
    confidence: Number(confidence.toFixed(2)),
    evidence: `name/keyword match on "${best.object}"`,
  };
}

function flowTokens(flow: ParsedFlow): Set<string> {
  const tokens = new Set<string>(tokenize(flow.apiName));
  if (flow.label) tokenize(flow.label).forEach((t) => tokens.add(t));
  return tokens;
}

function apexTokens(apex: ParsedApexClass): Set<string> {
  const tokens = new Set<string>(tokenize(apex.apiName));
  apex.businessKeywords.forEach((k) => tokenize(k).forEach((t) => tokens.add(t)));
  return tokens;
}

export function buildKnowledgeGraph(
  metadata: ParsedMetadata,
  options: BuildGraphOptions = {}
): KnowledgeGraph {
  const opts = { ...DEFAULTS, ...options };
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const objectIds = new Set(metadata.objects.map((o) => o.apiName));
  const objectIndex = objectTokenIndex(metadata.objects);

  const addEdge = (
    type: EdgeTypeId,
    source: string,
    target: string,
    extra: Partial<GraphEdge> = {}
  ) => {
    const def = EDGE_TYPES[type];
    edges.push({
      id: `${source}|${type}|${target}`,
      type,
      source,
      target,
      caption: extra.caption ?? def.label,
      derivation: extra.derivation ?? def.derivation,
      confidence: extra.confidence ?? def.baseConfidence,
      evidence: extra.evidence,
      properties: extra.properties,
    });
  };

  // --- Objects ------------------------------------------------------------
  for (const obj of metadata.objects) {
    nodes.push({
      id: `object:${obj.apiName}`,
      type: "Object",
      label: obj.label ?? obj.apiName,
      sourcePath: obj.sourcePath,
      properties: {
        apiName: obj.apiName,
        label: obj.label,
        custom: obj.custom,
        sharingModel: obj.sharingModel,
        deploymentStatus: obj.deploymentStatus,
      },
    });
  }

  // --- Fields + relationships --------------------------------------------
  for (const field of metadata.fields) {
    const objectNodeId = `object:${field.objectApiName}`;
    if (opts.includeFields) {
      nodes.push({
        id: `field:${field.objectApiName}.${field.apiName}`,
        type: "Field",
        label: field.label ?? field.apiName,
        sourcePath: field.sourcePath,
        properties: {
          apiName: field.apiName,
          object: field.objectApiName,
          type: field.type,
          required: field.required,
          unique: field.unique,
          picklistValues: field.picklistValues,
          relationshipType: field.relationshipType,
        },
      });
      addEdge("HAS_FIELD", objectNodeId, `field:${field.objectApiName}.${field.apiName}`);
    }

    // Lookup / Master-Detail references are explicit object->object links.
    for (const ref of field.references) {
      if (!objectIds.has(ref.referenceTo)) continue;
      const sourceId = opts.includeFields
        ? `field:${field.objectApiName}.${field.apiName}`
        : objectNodeId;
      addEdge("REFERENCES", sourceId, `object:${ref.referenceTo}`, {
        caption: field.relationshipType ?? "REFERENCES",
        evidence: `${field.objectApiName}.${field.apiName} ${
          field.relationshipType ?? "Lookup"
        } -> ${ref.referenceTo}`,
        properties: {
          relationshipName: ref.relationshipName,
          relationshipType: field.relationshipType,
        },
      });
    }
  }

  // --- Record types -------------------------------------------------------
  if (opts.includeRecordTypes) {
    for (const rt of metadata.recordTypes) {
      const id = `recordType:${rt.objectApiName}.${rt.apiName}`;
      nodes.push({
        id,
        type: "RecordType",
        label: rt.label ?? rt.apiName,
        sourcePath: rt.sourcePath,
        properties: { apiName: rt.apiName, object: rt.objectApiName, active: rt.active },
      });
      if (objectIds.has(rt.objectApiName)) {
        addEdge("RECORD_TYPE_OF", id, `object:${rt.objectApiName}`);
      }
    }
  }

  // --- Flows --------------------------------------------------------------
  if (opts.includeFlows) {
    for (const flow of metadata.flows) {
      const id = `flow:${flow.apiName}`;
      nodes.push({
        id,
        type: "Flow",
        label: flow.label ?? flow.apiName,
        sourcePath: flow.sourcePath,
        properties: {
          apiName: flow.apiName,
          status: flow.status,
          processType: flow.processType,
          triggerObject: flow.triggerObject,
        },
      });
      if (flow.triggerObject && objectIds.has(flow.triggerObject)) {
        addEdge("AUTOMATES", id, `object:${flow.triggerObject}`, {
          derivation: "explicit",
          confidence: 1,
          evidence: `flow trigger object = ${flow.triggerObject}`,
        });
      } else {
        const match = inferObjectMatch(flowTokens(flow), objectIndex, 0.5);
        if (match) {
          addEdge("AUTOMATES", id, `object:${match.object}`, {
            confidence: match.confidence,
            evidence: match.evidence,
          });
        }
      }
    }
  }

  // --- Apex classes -------------------------------------------------------
  if (opts.includeApex) {
    for (const apex of metadata.apexClasses) {
      const id = `class:${apex.apiName}`;
      nodes.push({
        id,
        type: "ApexClass",
        label: apex.apiName,
        sourcePath: apex.sourcePath,
        properties: {
          apiName: apex.apiName,
          logicCategory: apex.logicCategory,
          businessKeywords: apex.businessKeywords,
          integrationKeywords: apex.integrationKeywords,
          isTest: apex.isTest,
          lineCount: apex.lineCount,
        },
      });
      const explicit = apex.referencedObjects.filter((o) => objectIds.has(o));
      if (explicit.length) {
        for (const obj of explicit) {
          addEdge("OPERATES_ON", id, `object:${obj}`, {
            derivation: "explicit",
            confidence: 1,
            evidence: `referenced object ${obj}`,
          });
        }
      } else {
        const match = inferObjectMatch(apexTokens(apex), objectIndex, 0.4);
        if (match) {
          addEdge("OPERATES_ON", id, `object:${match.object}`, {
            confidence: match.confidence,
            evidence: match.evidence,
          });
        }
      }
    }
  }

  // --- Permission sets & profiles ----------------------------------------
  if (opts.includeSecurity) {
    const security = [
      ...metadata.permissionSets.map((p) => ({ ...p, _type: "PermissionSet" as const })),
      ...metadata.profiles.map((p) => ({
        ...p,
        label: p.apiName,
        description: undefined as string | undefined,
        _type: "Profile" as const,
      })),
    ];
    for (const sec of security) {
      const prefix = sec._type === "PermissionSet" ? "permissionset" : "profile";
      const id = `${prefix}:${sec.apiName}`;
      nodes.push({
        id,
        type: sec._type as NodeTypeId,
        label: sec.label ?? sec.apiName,
        sourcePath: sec.sourcePath,
        properties: {
          apiName: sec.apiName,
          description: sec.description,
          objectPermissionCount: sec.objectPermissions.length,
          fieldPermissionCount: sec.fieldPermissions.length,
        },
      });
      for (const perm of sec.objectPermissions) {
        if (objectIds.has(perm.object)) {
          addEdge("GRANTS_ACCESS", id, `object:${perm.object}`, {
            evidence: `grants access to ${perm.object}`,
            properties: {
              read: perm.allowRead,
              create: perm.allowCreate,
              edit: perm.allowEdit,
              delete: perm.allowDelete,
            },
          });
        }
      }
    }
  }

  return { nodes, edges, stats: computeStats(nodes, edges) };
}

export function computeStats(
  nodes: GraphNode[],
  edges: GraphEdge[]
): KnowledgeGraph["stats"] {
  const nodesByType = {} as Record<NodeTypeId, number>;
  const edgesByType = {} as Record<EdgeTypeId, number>;
  let inferredEdgeCount = 0;
  let llmEdgeCount = 0;
  let hybridEdgeCount = 0;
  let confidenceSum = 0;
  for (const n of nodes) nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;
  for (const e of edges) {
    edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
    if (e.derivation === "inferred") inferredEdgeCount += 1;
    if (e.derivation === "llm") llmEdgeCount += 1;
    if (e.derivation === "hybrid") hybridEdgeCount += 1;
    confidenceSum += e.confidence;
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodesByType,
    edgesByType,
    inferredEdgeCount,
    llmEdgeCount,
    hybridEdgeCount,
    avgConfidence: edges.length ? Number((confidenceSum / edges.length).toFixed(2)) : 0,
    enriched: llmEdgeCount > 0 || hybridEdgeCount > 0,
    generatedAt: new Date().toISOString(),
    builderVersion: GRAPH_BUILDER_VERSION,
  };
}
