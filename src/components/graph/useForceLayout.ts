/**
 * A small, dependency-free force-directed layout for the knowledge graph.
 *
 * Runs a fixed number of simulation ticks (spring + repulsion + collision +
 * centering) on an animation loop and exposes live positions. Collision
 * resolution keeps nodes from overlapping so the result reads cleanly even for
 * dense graphs. Designed for the graph sizes produced by this app (tens to
 * low-hundreds of nodes), where a full physics library would be overkill.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { NODE_TYPES, type GraphEdge, type GraphNode } from "@/lib/graph";

export interface LayoutState {
  positions: Record<string, { x: number; y: number }>;
  /** Bumped each time a fresh layout settles, so consumers can fit-to-view. */
  settleId: number;
  /** Imperatively set a node position (used while dragging). */
  setPosition: (id: string, x: number, y: number) => void;
  /** Pin/unpin a node so the simulation stops moving it. */
  setPinned: (id: string, pinned: boolean) => void;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
  degree: number;
  radius: number;
}

const TICKS = 420;
const REPULSION = 5200;
const SPRING = 0.045;
const SPRING_LENGTH = 96;
const CENTER_PULL = 0.03;
const DAMPING = 0.86;
const MAX_VELOCITY = 30;
const COLLISION_PADDING = 26;

function nodeRadius(node: GraphNode): number {
  return NODE_TYPES[node.type]?.radius ?? 18;
}

export function useForceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): LayoutState {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [settleId, setSettleId] = useState(0);
  const particlesRef = useRef<Map<string, Particle>>(new Map());
  const rafRef = useRef<number | null>(null);

  // A signature so the simulation re-seeds only when the graph truly changes.
  const signature = useMemo(
    () => `${nodes.map((n) => n.id).join(",")}|${edges.length}`,
    [nodes, edges]
  );

  useEffect(() => {
    if (!nodes.length || !width || !height) return;

    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    const cx = width / 2;
    const cy = height / 2;
    const particles = new Map<string, Particle>();
    // Seed on a phyllotaxis spiral for an even, compact starting distribution.
    nodes.forEach((node, i) => {
      const prev = particlesRef.current.get(node.id);
      const angle = i * 2.399963; // golden angle
      const radius = 12 * Math.sqrt(i + 1);
      particles.set(node.id, {
        id: node.id,
        x: prev?.x ?? cx + Math.cos(angle) * radius,
        y: prev?.y ?? cy + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        pinned: prev?.pinned ?? false,
        degree: degree.get(node.id) ?? 0,
        radius: nodeRadius(node),
      });
    });
    particlesRef.current = particles;

    const list = Array.from(particles.values());
    let tick = 0;

    const step = () => {
      // Repulsion (O(n^2), fine for our node counts).
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let distSq = dx * dx + dy * dy;
          if (distSq < 0.01) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            distSq = 0.01;
          }
          const dist = Math.sqrt(distSq);
          const force = REPULSION / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Springs along edges.
      for (const e of edges) {
        const a = particles.get(e.source);
        const b = particles.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (dist - SPRING_LENGTH) * SPRING;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Centering + integrate.
      for (const p of list) {
        if (p.pinned) continue;
        p.vx += (cx - p.x) * CENTER_PULL;
        p.vy += (cy - p.y) * CENTER_PULL;
        p.vx *= DAMPING;
        p.vy *= DAMPING;
        p.vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, p.vx));
        p.vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, p.vy));
        p.x += p.vx;
        p.y += p.vy;
      }

      // Collision resolution: push apart any overlapping nodes (a couple of
      // relaxation passes keeps it stable without a full constraint solver).
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            const min = a.radius + b.radius + COLLISION_PADDING;
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) {
              dx = Math.random() - 0.5;
              dy = Math.random() - 0.5;
              dist = 0.01;
            }
            if (dist < min) {
              const shift = (min - dist) / 2;
              const ox = (dx / dist) * shift;
              const oy = (dy / dist) * shift;
              if (!a.pinned) {
                a.x -= ox;
                a.y -= oy;
              }
              if (!b.pinned) {
                b.x += ox;
                b.y += oy;
              }
            }
          }
        }
      }

      const next: Record<string, { x: number; y: number }> = {};
      for (const p of list) next[p.id] = { x: p.x, y: p.y };
      setPositions(next);

      tick += 1;
      if (tick < TICKS) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setSettleId((s) => s + 1);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, width, height]);

  const setPosition = (id: string, x: number, y: number) => {
    const p = particlesRef.current.get(id);
    if (p) {
      p.x = x;
      p.y = y;
      p.vx = 0;
      p.vy = 0;
    }
    setPositions((prev) => ({ ...prev, [id]: { x, y } }));
  };

  const setPinned = (id: string, pinned: boolean) => {
    const p = particlesRef.current.get(id);
    if (p) p.pinned = pinned;
  };

  return { positions, settleId, setPosition, setPinned };
}
