import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import {
  META_SEVERIDAD_BRAIN,
  SEBIN_BRAIN_CORE_ID,
  type SebinBrainEdge,
  type SebinBrainGraph,
  type SebinBrainNode,
  type SeveridadBrain,
} from "@/domain/sebinBrainGraph";
import {
  CAM_EASE,
  CAM_EASE_HOME,
  cameraRect,
  lerpRect,
  type Bounds,
  type Rect,
} from "@/domain/sebinBrainCamera";
import {
  deltaGiroApex,
  layoutFocoUnidad,
  rotateAbout,
  type Pt,
} from "@/domain/sebinBrainFocus";
import { META_ESTADO_REPORTE } from "@/domain/reporteDiario";
import { rafThrottle } from "@/lib/raf-throttle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Minus, Plus, Scan } from "lucide-react";
import { SebinNeuralCore } from "./SebinNeuralCore";

const USER_ZOOM_MIN = 0.35;
const USER_ZOOM_MAX = 3.2;

const VB_W = 1000;
const VB_H = 720;
const CX = VB_W / 2;
const CY = VB_H / 2;
const SCALE = 340;

const RING_PX: Record<0 | 1 | 2, number> = {
  0: 0,
  1: SCALE * 0.42,
  2: SCALE * 0.82,
};

const R_NODE: Record<SebinBrainNode["kind"], number> = {
  sebin: 36,
  unidad: 17,
  campamento: 7.5,
};

type SimNode = SebinBrainNode &
  SimulationNodeDatum & {
    restX: number;
    restY: number;
    /** Tras drag: SEBIN (u otros) pueden anclarse donde el usuario soltó. */
    restOverride?: Pt | null;
  };
type SimLink = {
  source: string | SimNode;
  target: string | SimNode;
  kind: SebinBrainEdge["kind"];
};

function shortLabel(n: SebinBrainNode): string {
  if (n.kind === "campamento" && n.label.length > 18) {
    return `${n.label.slice(0, 16).trimEnd()}…`;
  }
  if (n.kind === "unidad" && n.label.length > 16) {
    return `${n.label.slice(0, 14).trimEnd()}…`;
  }
  return n.label;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function puntoArco(sx: number, sy: number, tx: number, ty: number, u: number): Pt {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const mx = (sx + tx) / 2 + (-dy / len) * 0.1 * len;
  const my = (sy + ty) / 2 + (dx / len) * 0.1 * len;
  const a = 1 - u;
  return {
    x: a * a * sx + 2 * a * u * mx + u * u * tx,
    y: a * a * sy + 2 * a * u * my + u * u * ty,
  };
}

function pathArco(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const mx = (sx + tx) / 2 + (-dy / len) * 0.1 * len;
  const my = (sy + ty) / 2 + (dx / len) * 0.1 * len;
  return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function restHome(n: SebinBrainNode, wheel = 0): Pt {
  const raw = {
    x: CX + Math.cos(n.angle) * n.radius * SCALE,
    y: CY + Math.sin(n.angle) * n.radius * SCALE,
  };
  if (!wheel) return raw;
  return rotateAbout(raw, { x: CX, y: CY }, wheel);
}

export function SebinBrainGraph({
  graph,
  selectedId,
  onSelect,
  className,
}: {
  graph: SebinBrainGraph;
  selectedId: string | null;
  onSelect: (node: SebinBrainNode | null) => void;
  className?: string;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusUnidadId, setFocusUnidadId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const pulseRefs = useRef<Map<string, SVGCircleElement>>(new Map());
  const pulseMetaRef = useRef<
    Map<string, { sourceId: string; targetId: string; dir: "out" | "in" }>
  >(new Map());
  const sparkRefs = useRef<(SVGCircleElement | null)[]>([]);
  const dragRef = useRef<{
    id: string;
    moved: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const focusTargetsRef = useRef<Map<string, Pt> | null>(null);
  const focusCenterRef = useRef<Pt | null>(null);
  const focusBoundsRef = useRef<Bounds | null>(null);
  const wheelRef = useRef(0);
  const wheelTargetRef = useRef(0);
  const camStateRef = useRef({
    focusedUnidad: false,
    selectedId: null as string | null,
    selectedKind: null as "campamento" | "unidad" | "sebin" | null,
  });
  const reducedRef = useRef(prefersReducedMotion());
  /** Zoom manual del usuario (1 = cámara cinematic pura). */
  const userZoomRef = useRef(1);
  const userPanRef = useRef({ x: 0, y: 0 });
  const baseCamRef = useRef<Rect>({
    x: -VB_W * 0.06,
    y: -VB_H * 0.06,
    w: VB_W * 1.12,
    h: VB_H * 1.12,
  });
  const panDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    originPanX: number;
    originPanY: number;
    moved: boolean;
  } | null>(null);
  const [userZoomUi, setUserZoomUi] = useState(1);

  const byId = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );

  const unidades = useMemo(
    () => graph.nodes.filter((n) => n.kind === "unidad"),
    [graph.nodes],
  );

  // layout de foco + giro apex
  const focusLayout = useMemo(() => {
    if (!focusUnidadId) return null;
    const camps = graph.nodes
      .filter((n) => n.kind === "campamento" && n.unidadClave && focusUnidadId === `unidad:${n.unidadClave}`)
      .sort(
        (a, b) =>
          (a.sublabel ?? "").localeCompare(b.sublabel ?? "", "es") ||
          a.label.localeCompare(b.label, "es"),
      );
    const otras = unidades.filter((u) => u.id !== focusUnidadId).map((u) => u.id);
    return layoutFocoUnidad({
      sebinId: SEBIN_BRAIN_CORE_ID,
      unidadId: focusUnidadId,
      campIds: camps.map((c) => c.id),
      otrasUnidadIds: otras,
      width: VB_W,
      height: VB_H,
    });
  }, [focusUnidadId, graph.nodes, unidades]);

  focusTargetsRef.current = focusLayout?.positions ?? null;
  focusCenterRef.current = focusLayout?.focusCenter ?? null;
  focusBoundsRef.current = focusLayout?.focusBounds ?? null;
  const selectedMeta = selectedId ? byId.get(selectedId) : null;
  camStateRef.current = {
    focusedUnidad: !!focusUnidadId,
    selectedId,
    selectedKind: selectedMeta?.kind ?? null,
  };

  // giro de rueda hacia apex al entrar en foco
  useEffect(() => {
    if (!focusUnidadId) {
      wheelTargetRef.current = 0;
      return;
    }
    const u = byId.get(focusUnidadId);
    if (!u) return;
    wheelTargetRef.current = deltaGiroApex(u.angle);
    simRef.current?.alpha(0.2).restart();
  }, [focusUnidadId, byId]);

  const topoKey = useMemo(
    () =>
      `${graph.nodes.map((n) => n.id).join("|")}::${graph.edges.map((e) => `${e.source}-${e.target}`).join("|")}`,
    [graph.nodes, graph.edges],
  );

  // ── d3-force ──────────────────────────────────────────────────────────
  useEffect(() => {
    const nodes: SimNode[] = graph.nodes.map((n) => {
      const home = restHome(n);
      return {
        ...n,
        x: home.x,
        y: home.y,
        restX: home.x,
        restY: home.y,
        vx: 0,
        vy: 0,
      };
    });
    const links: SimLink[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      kind: e.kind,
    }));
    nodesRef.current = nodes;
    linksRef.current = links;

    const renderTick = rafThrottle(() => setTick((t) => (t + 1) % 1_000_000));

    const targetOf = (d: SimNode): Pt | null => {
      const focus = focusTargetsRef.current;
      if (focus) {
        // camps de unidades no enfocadas: ocultos cerca del flanco de su unidad
        if (d.kind === "campamento") {
          const uid = d.unidadClave ? `unidad:${d.unidadClave}` : null;
          if (uid && focus.has(d.id)) return focus.get(d.id)!;
          if (uid && focus.has(uid)) {
            const u = focus.get(uid)!;
            return { x: u.x, y: u.y + 8 };
          }
        }
        return focus.get(d.id) ?? null;
      }
      // tras drag: SEBIN (y cualquier override) queda donde el usuario lo soltó
      if (d.restOverride) return d.restOverride;
      return restHome(d, wheelRef.current);
    };

    const sim = forceSimulation(nodes)
      .velocityDecay(0.62)
      .alphaDecay(0.014)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => {
            const t = typeof l.target === "object" ? l.target : null;
            return t?.kind === "campamento" ? 48 : 84;
          })
          .strength(() => (focusTargetsRef.current ? 0.02 : 0.32)),
      )
      .force(
        "charge",
        forceManyBody<SimNode>().strength((d) => {
          // en foco: charge suave — stage force ordena la grilla
          if (focusTargetsRef.current) return d.kind === "campamento" ? -8 : -24;
          return d.kind === "campamento" ? -28 : d.kind === "unidad" ? -90 : -40;
        }),
      )
      .force(
        "radial",
        forceRadial<SimNode>((d) => RING_PX[d.ring], CX, CY).strength(() =>
          focusTargetsRef.current ? 0 : 0.5,
        ),
      )
      .force("x", forceX<SimNode>(CX).strength(0))
      .force("y", forceY<SimNode>(CY).strength(0))
      .force(
        "collide",
        forceCollide<SimNode>((d) => R_NODE[d.kind] + (d.kind === "campamento" ? 3 : 6)),
      )
      .on("tick", renderTick);

    // custom stage force: pull toward focus/home targets every tick
    let stageNodes: SimNode[] = nodes;
    const stageForce = Object.assign(
      (alpha: number) => {
        for (const d of stageNodes) {
          if (d.fx != null || d.fy != null) continue; // dragging
          const t = targetOf(d);
          if (!t) continue;
          // foco: pull firme para reordenar visible (FounderOS stage ~0.9)
          const k = (focusTargetsRef.current ? 0.95 : 0.55) * alpha;
          d.vx = (d.vx ?? 0) + (t.x - (d.x ?? 0)) * k;
          d.vy = (d.vy ?? 0) + (t.y - (d.y ?? 0)) * k;
        }
      },
      { initialize: (ns: SimNode[]) => { stageNodes = ns; } },
    );
    sim.force("stage", stageForce);

    // SEBIN libre (sin pin): se arrastra como el resto
    simRef.current = sim;
    sim.alpha(0.9).restart();

    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topoKey]);

  // reheat al entrar/salir de foco (SEBIN nunca se pineá)
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const core = nodesRef.current.find((n) => n.kind === "sebin");
    if (core) {
      core.fx = null;
      core.fy = null;
      // al entrar a foco, soltar override para que vaya al tronco del árbol
      if (focusUnidadId) core.restOverride = null;
    }
    sim.alpha(0.45).restart();
  }, [focusUnidadId]);

  // patch severidad sin rebuild
  useEffect(() => {
    const live = nodesRef.current;
    if (!live.length) return;
    let changed = false;
    for (const n of live) {
      const fresh = byId.get(n.id);
      if (!fresh) continue;
      if (
        n.severidad !== fresh.severidad ||
        n.color !== fresh.color ||
        n.criticos !== fresh.criticos ||
        n.reportesOk !== fresh.reportesOk ||
        n.fasesOk !== fresh.fasesOk ||
        n.estadoReporte !== fresh.estadoReporte
      ) {
        n.severidad = fresh.severidad;
        n.color = fresh.color;
        n.criticos = fresh.criticos;
        n.reportesOk = fresh.reportesOk;
        n.fasesOk = fresh.fasesOk;
        n.estadoReporte = fresh.estadoReporte;
        n.sublabel = fresh.sublabel;
        changed = true;
      }
    }
    if (changed) setTick((t) => (t + 1) % 1_000_000);
  }, [byId]);

  // ── camera + pulses + wheel ease (un solo rAF, como FounderOS) ────────
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    let cur: Rect = {
      x: -VB_W * 0.06,
      y: -VB_H * 0.06,
      w: VB_W * 1.12,
      h: VB_H * 1.12,
    };

    const step = (nowT: number) => {
      const reduced = reducedRef.current;
      const dt = Math.min(0.1, (nowT - lastT) / 1000);
      lastT = nowT;

      // ease wheel
      const wd = wheelTargetRef.current - wheelRef.current;
      if (Math.abs(wd) > 0.0005) {
        wheelRef.current += wd * (reduced ? 1 : 0.1);
        simRef.current?.alpha(Math.max(simRef.current.alpha(), 0.06)).restart();
      } else {
        wheelRef.current = wheelTargetRef.current;
      }

      const nodes = nodesRef.current;
      const posOf = (id: string | null) => {
        if (!id) return null;
        const n = nodes.find((m) => m.id === id);
        return n ? { x: n.x ?? CX, y: n.y ?? CY } : null;
      };

      // camera — en foco enmarca árbol; zoom estrecho solo en camp
      const c = camStateRef.current;
      const target = cameraRect(
        { w: VB_W, h: VB_H },
        {
          focusedUnidad: c.focusedUnidad,
          selectedKind: c.selectedKind,
          selectedNodePos: posOf(c.selectedId),
          focusCenter: focusCenterRef.current,
          focusBounds: focusBoundsRef.current,
        },
      );
      const goingHome = !c.focusedUnidad && !c.selectedId;
      const next = lerpRect(
        cur,
        target,
        reduced ? 1 : goingHome ? CAM_EASE_HOME : CAM_EASE,
      );
      cur = next;
      baseCamRef.current = cur;
      // zoom/pan del usuario encima de la cámara cinematic
      const z = userZoomRef.current;
      const pan = userPanRef.current;
      const vw = cur.w / z;
      const vh = cur.h / z;
      const vcx = cur.x + cur.w / 2 + pan.x;
      const vcy = cur.y + cur.h / 2 + pan.y;
      svgRef.current?.setAttribute(
        "viewBox",
        `${vcx - vw / 2} ${vcy - vh / 2} ${vw} ${vh}`,
      );

      if (!reduced) {
        for (const [key, el] of pulseRefs.current) {
          const meta = pulseMetaRef.current.get(key);
          if (!meta) continue;
          const a = posOf(meta.sourceId);
          const b = posOf(meta.targetId);
          if (!a || !b) continue;
          const seed = (hashStr(`${meta.sourceId}|${meta.targetId}`) % 100) / 100;
          const period = meta.dir === "out" ? 2600 : 3300;
          const u =
            meta.dir === "out"
              ? (nowT / period + seed) % 1
              : 1 - ((nowT / period + seed * 1.7) % 1);
          const p = puntoArco(a.x, a.y, b.x, b.y, u);
          el.setAttribute("transform", `translate(${p.x},${p.y})`);
          el.setAttribute("opacity", String(0.85 * Math.sin(Math.PI * u)));
        }

        const critSegs: [number, number, number, number][] = [];
        for (const l of linksRef.current) {
          const s = typeof l.source === "object" ? l.source : null;
          const t = typeof l.target === "object" ? l.target : null;
          if (!s || !t) continue;
          if (t.severidad !== "critica" && s.severidad !== "critica") continue;
          critSegs.push([s.x ?? 0, s.y ?? 0, t.x ?? 0, t.y ?? 0]);
        }
        const sparks = sparkRefs.current;
        if (critSegs.length) {
          for (let i = 0; i < sparks.length; i++) {
            const el = sparks[i];
            if (!el) continue;
            const period = 2200 + ((i * 379) % 1600);
            const t = nowT + i * 911;
            const cycle = Math.floor(t / period);
            const seg = critSegs[(cycle * 131 + i * 37) % critSegs.length];
            const u = (t % period) / period;
            const p = puntoArco(seg[0], seg[1], seg[2], seg[3], u);
            el.setAttribute("cx", String(p.x));
            el.setAttribute("cy", String(p.y));
            el.setAttribute("opacity", String(0.95 * Math.sin(Math.PI * u)));
          }
        } else {
          for (const el of sparks) el?.setAttribute("opacity", "0");
        }
      }

      void dt;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Escape sale del foco
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedId || focusUnidadId) {
          setFocusUnidadId(null);
          onSelect(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, focusUnidadId, onSelect]);

  // ── drag ──────────────────────────────────────────────────────────────
  const simNode = (id: string) => nodesRef.current.find((n) => n.id === id) ?? null;
  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    dragRef.current = { id, moved: false, startX: e.clientX, startY: e.clientY };
    const node = simNode(id);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
    simRef.current?.alphaTarget(0.2).restart();
  };

  const onNodePointerMove = (e: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    if (
      !drag.moved &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3
    ) {
      drag.moved = true;
    }
    const p = toSvgPoint(e.clientX, e.clientY);
    const node = simNode(id);
    if (p && node) {
      node.fx = p.x;
      node.fy = p.y;
    }
  };

  const onNodePointerUp = (e: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    const node = simNode(id);
    if (node) {
      node.fx = null;
      node.fy = null;
      // SEBIN (y nodos en home) quedan donde el usuario los soltó
      if (drag.moved && !focusUnidadId) {
        node.restOverride = { x: node.x ?? CX, y: node.y ?? CY };
      }
    }
    simRef.current?.alphaTarget(0).alpha(0.14).restart();
    if (drag.moved) suppressClickRef.current = true;
    dragRef.current = null;
  };

  const clampZoom = (z: number) =>
    Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, z));

  const setUserZoom = (z: number, anchorClient?: { x: number; y: number }) => {
    const z0 = userZoomRef.current;
    const z1 = clampZoom(z);
    if (z1 === z0) return;

    const base = baseCamRef.current;
    const pan = userPanRef.current;
    const svg = svgRef.current;
    if (anchorClient && svg) {
      const rect = svg.getBoundingClientRect();
      const fracX = (anchorClient.x - rect.left) / Math.max(1, rect.width);
      const fracY = (anchorClient.y - rect.top) / Math.max(1, rect.height);
      const w0 = base.w / z0;
      const h0 = base.h / z0;
      const cx0 = base.x + base.w / 2 + pan.x;
      const cy0 = base.y + base.h / 2 + pan.y;
      const x0 = cx0 - w0 / 2;
      const y0 = cy0 - h0 / 2;
      const worldX = x0 + fracX * w0;
      const worldY = y0 + fracY * h0;
      const w1 = base.w / z1;
      const h1 = base.h / z1;
      const newCx = worldX - fracX * w1 + w1 / 2;
      const newCy = worldY - fracY * h1 + h1 / 2;
      userPanRef.current = {
        x: newCx - (base.x + base.w / 2),
        y: newCy - (base.y + base.h / 2),
      };
    }
    userZoomRef.current = z1;
    setUserZoomUi(z1);
  };

  const resetUserView = () => {
    userZoomRef.current = 1;
    userPanRef.current = { x: 0, y: 0 };
    setUserZoomUi(1);
  };

  // wheel no-passive: preventDefault para no scrollear la página
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.12;
      setUserZoom(userZoomRef.current * factor, { x: e.clientX, y: e.clientY });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onBgPointerDown = (e: React.PointerEvent) => {
    // solo fondo (no nodos)
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== "svg") {
      // permitir pan desde el rect de hit transparente
      const el = e.target as Element;
      if (!el.classList?.contains("sebin-pan-surface")) return;
    }
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    panDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPanX: userPanRef.current.x,
      originPanY: userPanRef.current.y,
      moved: false,
    };
  };

  const onBgPointerMove = (e: React.PointerEvent) => {
    const drag = panDragRef.current;
    if (!drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const base = baseCamRef.current;
    const z = userZoomRef.current;
    const worldPerPxX = base.w / z / Math.max(1, rect.width);
    const worldPerPxY = base.h / z / Math.max(1, rect.height);
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) > 3) drag.moved = true;
    // arrastrar el lienzo: el contenido sigue el dedo
    userPanRef.current = {
      x: drag.originPanX - dx * worldPerPxX,
      y: drag.originPanY - dy * worldPerPxY,
    };
  };

  const onBgPointerUp = (e: React.PointerEvent) => {
    const drag = panDragRef.current;
    if (!drag) return;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    if (drag.moved) suppressClickRef.current = true;
    panDragRef.current = null;
  };

  const onNodeClick = (n: SebinBrainNode) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (n.kind === "sebin") {
      setFocusUnidadId(null);
      onSelect(n);
      return;
    }
    if (n.kind === "unidad") {
      setFocusUnidadId((f) => (f === n.id ? null : n.id));
      onSelect(n);
      return;
    }
    // campamento: enfoca su unidad + selecciona + cámara al camp
    if (n.unidadClave) {
      setFocusUnidadId(`unidad:${n.unidadClave}`);
    }
    onSelect(n);
  };

  const clearFocus = () => {
    setFocusUnidadId(null);
    onSelect(null);
  };

  const focusNodeMeta = focusUnidadId ? byId.get(focusUnidadId) : undefined;
  const focusId = hoverId ?? selectedId;
  const focusNode = focusId ? byId.get(focusId) : undefined;

  const dimmed = (n: SebinBrainNode): boolean => {
    if (focusUnidadId) {
      if (n.kind === "sebin") return false;
      if (n.id === focusUnidadId) return false;
      if (n.kind === "campamento" && `unidad:${n.unidadClave}` === focusUnidadId)
        return false;
      // flancos de otras unidades: muy atenuados
      if (n.kind === "unidad") return true;
      return true;
    }
    if (!focusNode || focusNode.kind === "sebin") return false;
    if (n.id === focusNode.id) return false;
    if (focusNode.kind === "unidad") {
      return !(
        n.unidadClave === focusNode.unidadClave ||
        n.id === focusNode.id ||
        n.kind === "sebin"
      );
    }
    return !(
      n.id === focusNode.id ||
      n.id === `unidad:${focusNode.unidadClave}` ||
      n.kind === "sebin"
    );
  };

  const edgeActive = (sourceId: string, targetId: string): boolean => {
    if (focusUnidadId) {
      return (
        sourceId === SEBIN_BRAIN_CORE_ID ||
        sourceId === focusUnidadId ||
        targetId === focusUnidadId ||
        (byId.get(targetId)?.unidadClave
          ? `unidad:${byId.get(targetId)!.unidadClave}` === focusUnidadId
          : false)
      );
    }
    return true;
  };

  const linkEnds = (l: SimLink) => {
    const s =
      typeof l.source === "object"
        ? l.source
        : nodesRef.current.find((n) => n.id === l.source);
    const t =
      typeof l.target === "object"
        ? l.target
        : nodesRef.current.find((n) => n.id === l.target);
    if (!s || !t) return null;
    return {
      sx: s.x ?? CX,
      sy: s.y ?? CY,
      tx: t.x ?? CX,
      ty: t.y ?? CY,
      sourceId: s.id,
      targetId: t.id,
    };
  };

  const pulseKeys = useMemo(() => {
    const keys: {
      key: string;
      sourceId: string;
      targetId: string;
      dir: "out" | "in";
      critica: boolean;
    }[] = [];
    for (const e of graph.edges) {
      if (e.kind === "supervisa") {
        keys.push({
          key: `${e.source}=>${e.target}|out`,
          sourceId: e.source,
          targetId: e.target,
          dir: "out",
          critica: false,
        });
        keys.push({
          key: `${e.source}=>${e.target}|in`,
          sourceId: e.source,
          targetId: e.target,
          dir: "in",
          critica: false,
        });
      } else {
        const camp = byId.get(e.target);
        if (camp?.severidad === "critica") {
          keys.push({
            key: `${e.source}=>${e.target}|out`,
            sourceId: e.source,
            targetId: e.target,
            dir: "out",
            critica: true,
          });
        }
      }
    }
    return keys;
  }, [graph.edges, byId]);

  useEffect(() => {
    const m = new Map<
      string,
      { sourceId: string; targetId: string; dir: "out" | "in" }
    >();
    for (const p of pulseKeys) {
      m.set(p.key, {
        sourceId: p.sourceId,
        targetId: p.targetId,
        dir: p.dir,
      });
    }
    pulseMetaRef.current = m;
  }, [pulseKeys]);

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const SYNAPSE_N = 10;
  const draggingId = dragRef.current?.id ?? null;

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-background", className)}>
      <style>{`
        @keyframes sebin-grid-drift {
          from { background-position: 0 0; }
          to { background-position: 44px 44px; }
        }
        .sebin-space-grid {
          background-image:
            linear-gradient(to right, color-mix(in oklab, var(--border) 80%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in oklab, var(--border) 80%, transparent) 1px, transparent 1px);
          background-size: 44px 44px;
          opacity: 0.45;
          animation: sebin-grid-drift 26s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .sebin-space-grid { animation: none; }
        }
      `}</style>
      {/* grilla espacial (FounderOS kg-grid) */}
      <div className="sebin-space-grid pointer-events-none absolute inset-0" aria-hidden />

      <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
        {focusUnidadId && (
          <>
            <Button type="button" size="sm" variant="secondary" onClick={clearFocus}>
              <ArrowLeft className="size-3.5" />
              Red
            </Button>
            <span className="rounded-md border bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur">
              {focusNodeMeta?.label ?? "Unidad"}
            </span>
          </>
        )}
      </div>

      <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-md border bg-background/85 p-1 backdrop-blur">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Alejar"
          onClick={() => setUserZoom(userZoomRef.current * 0.85)}
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="min-w-10 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
          {Math.round(userZoomUi * 100)}%
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Acercar"
          onClick={() => setUserZoom(userZoomRef.current * 1.15)}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Restablecer vista"
          onClick={resetUserView}
        >
          <Scan className="size-3.5" />
        </Button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="sebin-brain-graph relative z-[1] block h-full w-full cursor-grab select-none active:cursor-grabbing"
        role="img"
        aria-label="Grafo operativo SEBIN. Rueda = zoom, arrastrar fondo = pan."
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          clearFocus();
        }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
      >
        {/* superficie de pan (fondo) */}
        <rect
          className="sebin-pan-surface"
          x={-VB_W}
          y={-VB_H}
          width={VB_W * 3}
          height={VB_H * 3}
          fill="transparent"
        />
        <defs>
          <radialGradient id="sebinCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="55%" stopColor="var(--primary)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="critHalo" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={META_SEVERIDAD_BRAIN.critica.color}
              stopOpacity="0.45"
            />
            <stop
              offset="70%"
              stopColor={META_SEVERIDAD_BRAIN.critica.color}
              stopOpacity="0.12"
            />
            <stop
              offset="100%"
              stopColor={META_SEVERIDAD_BRAIN.critica.color}
              stopOpacity="0"
            />
          </radialGradient>
          <filter id="brainSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <style>{`
          @keyframes sebin-glow-breathe {
            from { opacity: 0.22; }
            to { opacity: 0.55; }
          }
          @keyframes sebin-core-breathe {
            from { opacity: 0.045; }
            to { opacity: 0.14; }
          }
          @keyframes sebin-ray-move {
            to { stroke-dashoffset: -10; }
          }
          .sebin-core-glow {
            opacity: 0.08;
            animation: sebin-core-breathe 7s ease-in-out infinite alternate;
          }
          .sebin-crit-halo {
            animation: sebin-glow-breathe 2.8s ease-in-out infinite alternate;
          }
          .sebin-ray {
            stroke-dasharray: 5 5;
            animation: sebin-ray-move 1.6s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .sebin-core-glow, .sebin-crit-halo, .sebin-ray { animation: none; }
          }
        `}</style>

        {!focusUnidadId && (
          <>
            <circle
              cx={CX}
              cy={CY}
              r={SCALE * 0.95}
              fill="url(#sebinCoreGlow)"
              opacity="0.55"
            />
            <circle
              cx={CX}
              cy={CY}
              r={RING_PX[1]}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="3 8"
              opacity="0.55"
            />
            <circle
              cx={CX}
              cy={CY}
              r={RING_PX[2]}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.35"
            />
          </>
        )}

        <g>
          {links.map((l, i) => {
            const ends = linkEnds(l);
            if (!ends) return null;
            const { sx, sy, tx, ty, sourceId, targetId } = ends;
            const active = edgeActive(sourceId, targetId);
            if (focusUnidadId && !active) return null;
            const target = byId.get(targetId);
            const critica = target?.severidad === "critica";
            const stroke = critica
              ? META_SEVERIDAD_BRAIN.critica.color
              : l.kind === "supervisa"
                ? "var(--foreground)"
                : "var(--muted-foreground)";
            return (
              <path
                key={`${sourceId}-${targetId}-${i}`}
                d={pathArco(sx, sy, tx, ty)}
                fill="none"
                stroke={stroke}
                strokeWidth={
                  l.kind === "supervisa" ? 1.7 : critica ? 1.4 : 1
                }
                strokeLinecap="round"
                opacity={
                  active
                    ? critica
                      ? 0.75
                      : l.kind === "supervisa"
                        ? 0.45
                        : 0.32
                    : 0.04
                }
                className={
                  l.kind === "supervisa" && active ? "sebin-ray" : undefined
                }
                style={{ transition: "opacity 0.35s ease" }}
              />
            );
          })}
        </g>

        <g style={{ pointerEvents: "none" }}>
          {pulseKeys.map(({ key, critica }) => (
            <circle
              key={key}
              ref={(el) => {
                if (el) pulseRefs.current.set(key, el);
                else pulseRefs.current.delete(key);
              }}
              r={critica ? 2.6 : 2}
              fill={
                critica ? META_SEVERIDAD_BRAIN.critica.color : "var(--primary)"
              }
              opacity={0}
              transform="translate(-999,-999)"
              filter={critica ? "url(#brainSoftGlow)" : undefined}
            />
          ))}
          {Array.from({ length: SYNAPSE_N }, (_, i) => (
            <circle
              key={`spark-${i}`}
              ref={(el) => {
                sparkRefs.current[i] = el;
              }}
              r={2.2}
              fill={META_SEVERIDAD_BRAIN.critica.color}
              opacity={0}
              cx={-999}
              cy={-999}
              filter="url(#brainSoftGlow)"
            />
          ))}
        </g>

        <g>
          {[...nodes]
            .sort((a, b) => a.ring - b.ring)
            .map((n) => {
              // ocultar camps de otras unidades en foco
              if (
                focusUnidadId &&
                n.kind === "campamento" &&
                `unidad:${n.unidadClave}` !== focusUnidadId
              ) {
                return null;
              }
              const x = n.x ?? CX;
              const y = n.y ?? CY;
              const r = R_NODE[n.kind];
              const isSel = selectedId === n.id;
              const isHover = hoverId === n.id;
              const fade = dimmed(n);
              const sevColor = META_SEVERIDAD_BRAIN[n.severidad].color;
              const fill = n.kind === "unidad" ? n.color : sevColor;
              const showCampLabel =
                n.kind === "campamento" &&
                (isHover || isSel || !!focusUnidadId);
              return (
                <g
                  key={n.id}
                  transform={`translate(${x} ${y})`}
                  opacity={fade ? (n.kind === "unidad" ? 0.22 : 0.1) : 1}
                  style={{
                    cursor:
                      draggingId === n.id ? "grabbing" : "grab",
                    transition: "opacity 0.28s ease",
                  }}
                  onMouseEnter={() => setHoverId(n.id)}
                  onMouseLeave={() =>
                    setHoverId((h) => (h === n.id ? null : h))
                  }
                  onPointerDown={(e) => onNodePointerDown(e, n.id)}
                  onPointerMove={(e) => onNodePointerMove(e, n.id)}
                  onPointerUp={(e) => onNodePointerUp(e, n.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNodeClick(n);
                  }}
                >
                  {n.severidad === "critica" && !fade && n.kind !== "sebin" && (
                    <circle
                      r={r + 14}
                      fill="url(#critHalo)"
                      className="sebin-crit-halo"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {(isSel || isHover) && (
                    <circle
                      r={(n.kind === "sebin" ? 42 : r) + 5}
                      fill="none"
                      stroke="var(--foreground)"
                      strokeWidth="1.5"
                      opacity="0.8"
                    />
                  )}
                  {n.kind === "sebin" ? (
                    <>
                      {/* hit area: el neural core tiene pointer-events none */}
                      <circle r={44} fill="transparent" />
                      <SebinNeuralCore radius={34} color={sevColor} label="SEBIN" />
                    </>
                  ) : (
                    <>
                      <circle
                        r={r}
                        fill={fill}
                        stroke="var(--background)"
                        strokeWidth={1.4}
                        filter={
                          n.severidad === "critica"
                            ? "url(#brainSoftGlow)"
                            : undefined
                        }
                      />
                      {n.kind === "unidad" && (
                        <text
                          y={4}
                          textAnchor="middle"
                          className="fill-foreground"
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            pointerEvents: "none",
                          }}
                        >
                          {shortLabel(n)}
                        </text>
                      )}
                    </>
                  )}
                  {n.kind === "unidad" && !focusUnidadId && (
                    <text
                      y={r + 12}
                      textAnchor="middle"
                      className="fill-muted-foreground"
                      style={{ fontSize: 8, pointerEvents: "none" }}
                    >
                      {n.criticos > 0
                        ? `${n.criticos} crítica${n.criticos === 1 ? "" : "s"}`
                        : `${n.reportesOk}/${n.camps} ok`}
                    </text>
                  )}
                  {showCampLabel && (
                    <text
                      y={-r - 8}
                      textAnchor="middle"
                      className="fill-foreground"
                      style={{
                        fontSize: focusUnidadId ? 9 : 9,
                        fontWeight: 600,
                        pointerEvents: "none",
                      }}
                    >
                      {shortLabel(n)}
                    </text>
                  )}
                </g>
              );
            })}
        </g>
      </svg>
    </div>
  );
}

export function LeyendaSeveridadBrain({
  className,
}: {
  className?: string;
}) {
  const items: SeveridadBrain[] = ["ok", "parcial", "pendiente", "critica"];
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {items.map((s) => (
        <div
          key={s}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: META_SEVERIDAD_BRAIN[s].color }}
          />
          {META_SEVERIDAD_BRAIN[s].label}
        </div>
      ))}
    </div>
  );
}

export function DetalleNodoBrain({
  node,
  dia,
}: {
  node: SebinBrainNode;
  dia: string;
}) {
  const sev = META_SEVERIDAD_BRAIN[node.severidad];
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {node.kind === "sebin"
            ? "Núcleo"
            : node.kind === "unidad"
              ? "Unidad de supervisión"
              : "Campamento"}
        </div>
        <h3 className="mt-0.5 text-base font-semibold leading-tight">
          {node.label}
        </h3>
        {node.sublabel && (
          <p className="text-xs text-muted-foreground">{node.sublabel}</p>
        )}
      </div>

      <div
        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium"
        style={{ borderColor: sev.color, color: sev.color }}
      >
        <span className="size-2 rounded-full" style={{ background: sev.color }} />
        {sev.label}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border bg-muted/30 px-2 py-1.5">
          <dt className="text-muted-foreground">Campamentos</dt>
          <dd className="text-sm font-semibold tabular-nums">{node.camps}</dd>
        </div>
        <div className="rounded-md border bg-muted/30 px-2 py-1.5">
          <dt className="text-muted-foreground">Reportes OK</dt>
          <dd className="text-sm font-semibold tabular-nums">{node.reportesOk}</dd>
        </div>
        <div className="rounded-md border bg-muted/30 px-2 py-1.5">
          <dt className="text-muted-foreground">Críticos hoy</dt>
          <dd className="text-sm font-semibold tabular-nums text-red-500">
            {node.criticos}
          </dd>
        </div>
        {node.fasesOk != null && (
          <div className="rounded-md border bg-muted/30 px-2 py-1.5">
            <dt className="text-muted-foreground">Fases reporte</dt>
            <dd className="text-sm font-semibold tabular-nums">
              {node.fasesOk}/6
            </dd>
          </div>
        )}
      </dl>

      {node.estadoReporte && (
        <p className="text-xs text-muted-foreground">
          Reporte {dia}:{" "}
          <span
            className="font-medium"
            style={{ color: META_ESTADO_REPORTE[node.estadoReporte].color }}
          >
            {META_ESTADO_REPORTE[node.estadoReporte].label}
          </span>
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Arrastrá nodos (incl. SEBIN) · rueda = zoom · arrastrar fondo = pan · Esc = volver
      </p>
    </div>
  );
}
