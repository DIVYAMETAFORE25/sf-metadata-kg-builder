import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Network,
  UploadCloud,
  Download,
  Search,
  X,
  Sparkles,
  RotateCcw,
  Loader2,
  AlertCircle,
  Brain,
  Info,
} from "lucide-react";
import AppLayout, { PageHeader } from "@/components/layout/AppLayout";
import { Badge, Button, Card, EmptyState, StatTile } from "@/components/ui";
import GraphCanvas from "@/components/graph/GraphCanvas";
import { usePipeline } from "@/store/PipelineContext";
import { downloadJson, formatNumber, cn } from "@/lib/utils";
import {
  buildKnowledgeGraph,
  mergeLlmRelationships,
  NODE_TYPE_LIST,
  NODE_TYPES,
  DERIVATION_STYLES,
  DERIVATION_STYLE_LIST,
  type BuildGraphOptions,
  type NodeTypeId,
  type LlmRelationship,
} from "@/lib/graph";
import { enrichGraph, getLlmStatus, type LlmStatus } from "@/lib/llm/client";

const FILTER_OPTIONS: { id: NodeTypeId; key: keyof BuildGraphOptions }[] = [
  { id: "Field", key: "includeFields" },
  { id: "RecordType", key: "includeRecordTypes" },
  { id: "Flow", key: "includeFlows" },
  { id: "ApexClass", key: "includeApex" },
  { id: "PermissionSet", key: "includeSecurity" },
];

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function KnowledgeGraph() {
  const navigate = useNavigate();
  const { metadata, status, bundleName } = usePipeline();
  const [options, setOptions] = useState<BuildGraphOptions>({
    includeFields: false,
    includeRecordTypes: true,
    includeFlows: true,
    includeApex: true,
    includeSecurity: true,
  });
  const [hiddenTypes, setHiddenTypes] = useState<Set<NodeTypeId>>(new Set());
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // LLM enrichment state.
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [llmRelationships, setLlmRelationships] = useState<LlmRelationship[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichInfo, setEnrichInfo] = useState<string | null>(null);

  useEffect(() => {
    getLlmStatus().then(setLlmStatus);
  }, []);

  // Rule-built base graph.
  const base = useMemo(
    () => (metadata ? buildKnowledgeGraph(metadata, options) : null),
    [metadata, options]
  );

  // Hybrid graph: base graph with LLM relationships merged in (if any).
  const graph = useMemo(() => {
    if (!base) return null;
    if (!llmRelationships.length) return base;
    return mergeLlmRelationships(base, llmRelationships);
  }, [base, llmRelationships]);

  const filtered = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const q = query.trim().toLowerCase();
    const visibleNodes = graph.nodes.filter((n) => {
      if (hiddenTypes.has(n.type)) return false;
      if (q && !n.label.toLowerCase().includes(q) && !n.id.toLowerCase().includes(q))
        return false;
      return true;
    });
    const ids = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graph.edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target)
    );
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [graph, hiddenTypes, query]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId]
  );
  const selectedEdges = useMemo(() => {
    if (!graph || !selectedId) return [];
    return graph.edges.filter(
      (e) => e.source === selectedId || e.target === selectedId
    );
  }, [graph, selectedId]);

  if (status !== "ready" || !metadata || !graph || !base) {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Stage 05 · Knowledge Graph"
          title="Knowledge Graph Generator"
          description="Builds typed nodes and relationships from the parsed metadata using ontology rules plus optional LLM enrichment."
        />
        <EmptyState
          icon={Network}
          title="No metadata to graph"
          description="Upload and parse a Salesforce metadata bundle first. The knowledge graph is generated from the Stage 1 parser output."
          action={
            <Button icon={UploadCloud} onClick={() => navigate("/upload")}>
              Upload metadata
            </Button>
          }
        />
      </AppLayout>
    );
  }

  const toggleOption = (key: keyof BuildGraphOptions) =>
    setOptions((o) => ({ ...o, [key]: !o[key] }));

  const toggleHidden = (id: NodeTypeId) =>
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const runEnrich = async () => {
    if (!metadata || !base) return;
    setEnriching(true);
    setEnrichError(null);
    setEnrichInfo(null);
    try {
      const result = await enrichGraph(metadata, base);
      setLlmRelationships(result.relationships);
      setEnrichInfo(
        `${result.relationships.length} business relationships from ${result.model}.`
      );
    } catch (e) {
      setEnrichError((e as Error).message);
    } finally {
      setEnriching(false);
    }
  };

  const clearEnrich = () => {
    setLlmRelationships([]);
    setEnrichInfo(null);
    setEnrichError(null);
  };

  const configured = llmStatus?.llmConfigured ?? false;
  const enriched = graph.stats.enriched;
  const aiLinks = graph.stats.llmEdgeCount + graph.stats.hybridEdgeCount;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Stage 05 · Knowledge Graph"
        title="Knowledge Graph"
        description={`Hybrid graph from ${
          bundleName ?? "the parsed bundle"
        } — ontology rules${enriched ? " + LLM business logic" : ""}.`}
        actions={
          <>
            <Badge tone={enriched ? "success" : "brand"}>
              <Sparkles size={12} /> Builder v{graph.stats.builderVersion}
            </Badge>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() =>
                downloadJson(
                  { nodes: graph.nodes, edges: graph.edges, stats: graph.stats },
                  "knowledge_graph.json"
                )
              }
            >
              Export
            </Button>
            <Button
              icon={enriching ? undefined : Brain}
              onClick={runEnrich}
              disabled={!configured || enriching}
              title={
                configured
                  ? "Enrich the graph with LLM-inferred business relationships"
                  : "Add OPENAI_API_KEY to .env and restart the API to enable this"
              }
            >
              {enriching ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Analyzing…
                </>
              ) : enriched ? (
                "Re-run AI"
              ) : (
                "Enhance with AI"
              )}
            </Button>
          </>
        }
      />

      {/* LLM status / result banners */}
      {!configured && llmStatus && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <Info size={18} className="mt-0.5 shrink-0 text-gray-400" />
          <div>
            <p className="font-semibold text-gray-700">
              AI enrichment is off — showing the rules-only graph.
            </p>
            <p className="mt-0.5">
              Add <code className="font-mono text-xs">OPENAI_API_KEY</code> to your{" "}
              <code className="font-mono text-xs">.env</code> file and restart the
              API service to enable LLM business-logic inference.
            </p>
          </div>
        </div>
      )}
      {enrichError && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">AI enrichment failed</p>
            <p className="mt-0.5 text-error-600">{enrichError}</p>
          </div>
        </div>
      )}
      {enrichInfo && !enrichError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
          <span className="flex items-center gap-2 font-medium">
            <Sparkles size={16} /> {enrichInfo}
          </span>
          <button
            onClick={clearEnrich}
            className="text-xs font-semibold text-success-700 underline-offset-2 hover:underline"
          >
            Clear AI links
          </button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          code="NODES"
          value={formatNumber(filtered.nodes.length)}
          label="Visible nodes"
          caption={`${graph.stats.nodeCount} total`}
          icon={Network}
          highlight
        />
        <StatTile
          code="EDGES"
          value={formatNumber(filtered.edges.length)}
          label="Relationships"
          caption={`${graph.stats.edgeCount} total`}
        />
        <StatTile
          code="CONFIDENCE"
          value={pct(graph.stats.avgConfidence)}
          label="Avg confidence"
          caption="Across all edges"
        />
        <StatTile
          code="AI LINKS"
          value={formatNumber(aiLinks)}
          label="LLM-derived"
          caption={`${graph.stats.hybridEdgeCount} confirmed · ${graph.stats.llmEdgeCount} new`}
        />
      </div>

      {/* Controls */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes…"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_OPTIONS.map((opt) => {
              const on = options[opt.key] ?? false;
              return (
                <button
                  key={opt.key}
                  onClick={() => toggleOption(opt.key)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors",
                    on
                      ? "bg-brand-50 text-brand-700 ring-brand-200"
                      : "bg-white text-gray-500 ring-gray-200 hover:bg-gray-50"
                  )}
                >
                  {on ? "− " : "+ "}
                  {NODE_TYPES[opt.id].plural}
                </button>
              );
            })}
          </div>
        </div>

        {/* Edge source / confidence legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Edge source
          </span>
          {DERIVATION_STYLE_LIST.map((d) => (
            <span key={d.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <svg width="22" height="6" className="shrink-0">
                <line
                  x1="0"
                  y1="3"
                  x2="22"
                  y2="3"
                  stroke={d.color}
                  strokeWidth="2"
                  strokeDasharray={d.dashed ? "4 3" : undefined}
                />
              </svg>
              {d.label}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Canvas */}
        <Card className="relative overflow-hidden p-0">
          <div className="h-[620px] w-full bg-gray-50/60">
            <GraphCanvas
              nodes={filtered.nodes}
              edges={filtered.edges}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Legend overlay */}
          <div className="absolute left-3 top-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Node labels
            </div>
            <div className="flex flex-col gap-1.5">
              {NODE_TYPE_LIST.map((t) => {
                const count = graph.stats.nodesByType[t.id] ?? 0;
                if (!count) return null;
                const hidden = hiddenTypes.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleHidden(t.id)}
                    className={cn(
                      "flex items-center gap-2 text-left text-xs transition-opacity",
                      hidden && "opacity-35"
                    )}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full ring-1"
                      style={{ background: t.color, borderColor: t.ring }}
                    />
                    <span className="font-medium text-gray-700">{t.id}</span>
                    <span className="text-gray-400">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="absolute bottom-3 right-3 rounded-lg border border-gray-200 bg-white/90 px-2.5 py-1.5 text-[10px] text-gray-400 shadow-sm">
            Drag nodes · scroll to zoom · drag background to pan
          </div>
        </Card>

        {/* Inspector */}
        <Card className="flex flex-col p-4">
          {selectedNode ? (
            <>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full ring-1"
                    style={{
                      background: NODE_TYPES[selectedNode.type].color,
                      borderColor: NODE_TYPES[selectedNode.type].ring,
                    }}
                  />
                  <Badge tone="gray">{selectedNode.type}</Badge>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
              <h3 className="mt-3 break-words text-base font-semibold text-gray-900">
                {selectedNode.label}
              </h3>
              <code className="mt-0.5 block break-all text-[11px] text-gray-400">
                {selectedNode.id}
              </code>

              <div className="mt-4 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Properties
              </div>
              <dl className="mt-2 space-y-1.5">
                {Object.entries(selectedNode.properties)
                  .filter(([, v]) => v !== undefined && v !== null && v !== "")
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 text-xs">
                      <dt className="shrink-0 text-gray-500">{k}</dt>
                      <dd className="break-words text-right font-medium text-gray-800">
                        {formatValue(v)}
                      </dd>
                    </div>
                  ))}
              </dl>

              <div className="mt-4 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Relationships ({selectedEdges.length})
              </div>
              <div className="mt-2 space-y-2 overflow-y-auto">
                {selectedEdges.map((e) => {
                  const outgoing = e.source === selectedId;
                  const other = outgoing ? e.target : e.source;
                  const style = DERIVATION_STYLES[e.derivation];
                  return (
                    <div
                      key={e.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2"
                    >
                      <button
                        onClick={() => setSelectedId(other)}
                        className="flex w-full items-center gap-2 text-left text-xs"
                      >
                        <span className="text-gray-400">{outgoing ? "→" : "←"}</span>
                        <span className="font-mono text-[10px] text-brand-700">
                          {e.caption}
                        </span>
                        <span className="ml-auto truncate text-gray-600">
                          {other.replace(/^[a-z]+:/i, "")}
                        </span>
                      </button>

                      {/* Confidence bar + source */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: style?.color }}
                          title={style?.label}
                        />
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: pct(e.confidence),
                              background: style?.color,
                            }}
                          />
                        </div>
                        <span className="w-9 text-right text-[10px] font-semibold text-gray-500">
                          {pct(e.confidence)}
                        </span>
                      </div>

                      {(e.rationale || e.evidence) && (
                        <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                          {e.rationale ?? e.evidence}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                <Network size={20} />
              </div>
              <p className="mt-3 text-sm font-medium text-gray-700">
                Select a node
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Click any node to inspect its properties and scored relationships.
              </p>
              {(query || hiddenTypes.size > 0) && (
                <Button
                  className="mt-4"
                  variant="ghost"
                  icon={RotateCcw}
                  onClick={() => {
                    setQuery("");
                    setHiddenTypes(new Set());
                  }}
                >
                  Reset filters
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
