/**
 * Neo4j-Browser-style graph canvas.
 *
 * Renders the knowledge graph as an interactive SVG: coloured circular nodes
 * with captions, curved relationships with type labels and arrowheads, plus
 * pan, zoom, and node dragging. Selection highlights the node and its
 * immediate neighbourhood and dims the rest, mirroring the Neo4j Browser.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { GraphEdge, GraphNode } from "@/lib/graph";
import { NODE_TYPES } from "@/lib/graph";
import { useForceLayout } from "./useForceLayout";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

export default function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { positions, settleId, setPosition, setPinned } = useForceLayout(
    nodes,
    edges,
    size.width,
    size.height
  );

  // Track container size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the settled graph into view (centre + zoom to bounding box).
  const fitToView = useCallback(() => {
    const pts = Object.values(positions);
    if (pts.length < 2 || !size.width || !size.height) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = 80;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const k = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.min(size.width / w, size.height / h))
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setTransform({
      k,
      x: size.width / 2 - cx * k,
      y: size.height / 2 - cy * k,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, size.width, size.height]);

  // Auto-fit when a fresh layout settles.
  useEffect(() => {
    if (settleId > 0) fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleId]);

  // Neighbour map for highlight.
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [edges]);

  const activeId = hoverId ?? selectedId;
  const isDimmed = useCallback(
    (id: string) => {
      if (!activeId) return false;
      if (id === activeId) return false;
      return !neighbours.get(activeId)?.has(id);
    },
    [activeId, neighbours]
  );

  // --- Pan & zoom ---------------------------------------------------------
  const panState = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const dragState = useRef<{ id: string } | null>(null);

  const onBackgroundPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return;
    onSelect(null);
    panState.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragState.current) {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.k;
      const y = (e.clientY - rect.top - transform.y) / transform.k;
      setPosition(dragState.current.id, x, y);
      return;
    }
    if (panState.current) {
      setTransform((t) => ({
        ...t,
        x: panState.current!.tx + (e.clientX - panState.current!.x),
        y: panState.current!.ty + (e.clientY - panState.current!.y),
      }));
    }
  };

  const endInteraction = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragState.current) {
      setPinned(dragState.current.id, true);
      dragState.current = null;
    }
    panState.current = null;
    try {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onNodePointerDown = (e: ReactPointerEvent<SVGGElement>, id: string) => {
    e.stopPropagation();
    onSelect(id);
    dragState.current = { id };
    (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
  };

  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setTransform((t) => {
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k * factor));
      const ratio = k / t.k;
      return { k, x: mx - (mx - t.x) * ratio, y: my - (my - t.y) * ratio };
    });
  };

  const zoomBy = (factor: number) => {
    const mx = size.width / 2;
    const my = size.height / 2;
    setTransform((t) => {
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k * factor));
      const ratio = k / t.k;
      return { k, x: mx - (mx - t.x) * ratio, y: my - (my - t.y) * ratio };
    });
  };

  const fallback = (i: number) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    return {
      x: size.width / 2 + Math.cos(angle) * 200,
      y: size.height / 2 + Math.sin(angle) * 200,
    };
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <svg
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerLeave={endInteraction}
        onWheel={onWheel}
      >
        <defs>
          {Object.values(NODE_TYPES).map((t) => (
            <marker
              key={t.id}
              id={`arrow-${t.id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Edges */}
          {edges.map((edge) => {
            const a = positions[edge.source];
            const b = positions[edge.target];
            if (!a || !b) return null;
            const dimmed =
              activeId !== null &&
              edge.source !== activeId &&
              edge.target !== activeId;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const inferred = edge.derivation === "inferred";
            // Only label edges connected to the active node, to avoid clutter.
            const showLabel =
              activeId !== null &&
              (edge.source === activeId || edge.target === activeId);
            const highlighted =
              activeId !== null &&
              (edge.source === activeId || edge.target === activeId);
            return (
              <g key={edge.id} opacity={dimmed ? 0.06 : 1}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={highlighted ? "#475569" : "#cbd5e1"}
                  strokeWidth={highlighted ? 2 : 1.25}
                  strokeDasharray={inferred ? "5 4" : undefined}
                  markerEnd={`url(#arrow-${NODE_TYPES.Object.id})`}
                />
                {showLabel && (
                  <text
                    x={mx}
                    y={my}
                    dy={-3}
                    textAnchor="middle"
                    className="select-none"
                    fontSize={9}
                    fontWeight={600}
                    fill="#475569"
                  >
                    {edge.caption}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const pos = positions[node.id] ?? fallback(i);
            const def = NODE_TYPES[node.type];
            const dimmed = isDimmed(node.id);
            const selected = node.id === selectedId;
            const isActive = node.id === activeId;
            const r = def.radius;
            // To keep the canvas readable, always caption Object nodes; caption
            // the rest only when zoomed in or when they are the active node.
            const showCaption =
              node.type === "Object" || isActive || transform.k >= 0.85;
            return (
              <g
                key={node.id}
                transform={`translate(${pos.x},${pos.y})`}
                opacity={dimmed ? 0.18 : 1}
                className="cursor-pointer"
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                onPointerEnter={() => setHoverId(node.id)}
                onPointerLeave={() => setHoverId(null)}
              >
                <circle
                  r={r}
                  fill={def.color}
                  stroke={selected ? "#0f172a" : def.ring}
                  strokeWidth={selected ? 3 : 1.5}
                />
                {showCaption && (
                  <text
                    textAnchor="middle"
                    dy={r + 13}
                    fontSize={node.type === "Object" ? 11 : 10}
                    fontWeight={node.type === "Object" ? 700 : 500}
                    fill="#0f172a"
                    stroke="#f8fafc"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="select-none"
                  >
                    {truncate(node.label, 22)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom / fit controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button
          onClick={() => zoomBy(1.2)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white/95 text-gray-600 shadow-sm hover:bg-gray-50"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => zoomBy(1 / 1.2)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white/95 text-gray-600 shadow-sm hover:bg-gray-50"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={fitToView}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white/95 text-[10px] font-semibold text-gray-600 shadow-sm hover:bg-gray-50"
          title="Fit to view"
        >
          FIT
        </button>
      </div>
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
