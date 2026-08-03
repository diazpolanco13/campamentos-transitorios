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
  branchPath,
  branchWidth,
  cyclicDeltaF,
  deltaGiroApex,
  focusWheel,
  layoutFocoUnidad,
  limbIdForCamp,
  rotateAbout,
  wheelStageGeom,
  type FocusLayoutResult,
  type Pt,
} from "@/domain/sebinBrainFocus";
import { META_ESTADO_REPORTE } from "@/domain/reporteDiario";
import { rafThrottle } from "@/lib/raf-throttle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Minus, Plus, Scan, X } from "lucide-react";
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

const WHEEL_GEOM = wheelStageGeom(VB_W, VB_H);
const FOCUS_WHEEL = focusWheel(VB_W, VB_H, RING_PX[1]);
/** Radios de las guías radar (home); en foco se escalan × FOCUS_WHEEL.scale. */
const ORBIT_R = [
  RING_PX[1] * 0.52,
  RING_PX[1],
  (RING_PX[1] + RING_PX[2]) / 2,
  RING_PX[2],
  RING_PX[2] * 1.18,
];
/** |offset| > esto → unidad fuera de escena. */
const RIM_VISIBLE = 1.25;
const APEX_EPS = 0.42;

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
  const allTreesRef = useRef<Map<string, FocusLayoutResult>>(new Map());
  const unidadOrderRef = useRef<string[]>([]);
  const focusUnidadRef = useRef<string | null>(null);
  const stagePhaseRef = useRef(0);
  const stageTargetRef = useRef(0);
  const stageVelRef = useRef(0);
  const prevFocusUnidadRef = useRef<string | null>(null);
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

  const campsOf = useMemo(() => {
    const m = new Map<string, SebinBrainNode[]>();
    for (const n of graph.nodes) {
      if (n.kind !== "campamento" || !n.unidadClave) continue;
      const uid = `unidad:${n.unidadClave}`;
      const list = m.get(uid) ?? [];
      list.push(n);
      m.set(uid, list);
    }
    for (const [, list] of m) {
      list.sort(
        (a, b) =>
          (a.sublabel ?? "").localeCompare(b.sublabel ?? "", "es") ||
          a.label.localeCompare(b.label, "es"),
      );
    }
    return m;
  }, [graph.nodes]);

  /** Árbol upright por cada unidad — flancos rotan este layout en el rim. */
  const allTrees = useMemo(() => {
    const map = new Map<string, FocusLayoutResult>();
    for (const u of unidades) {
      const camps = campsOf.get(u.id) ?? [];
      map.set(
        u.id,
        layoutFocoUnidad({
          sebinId: SEBIN_BRAIN_CORE_ID,
          unidadId: u.id,
          camps: camps.map((c) => ({
            id: c.id,
            label: c.label,
            sublabel: c.sublabel,
          })),
          width: VB_W,
          height: VB_H,
        }),
      );
    }
    return map;
  }, [unidades, campsOf]);

  const focusLayout = focusUnidadId
    ? (allTrees.get(focusUnidadId) ?? null)
    : null;

  const unidadOrder = useMemo(() => unidades.map((u) => u.id), [unidades]);

  const flankUnidades = useMemo(() => {
    if (!focusUnidadId || unidadOrder.length < 2) return new Set<string>();
    const fi = unidadOrder.indexOf(focusUnidadId);
    if (fi < 0) return new Set<string>();
    return new Set([
      unidadOrder[(fi + 1) % unidadOrder.length],
      unidadOrder[(fi - 1 + unidadOrder.length) % unidadOrder.length],
    ]);
  }, [focusUnidadId, unidadOrder]);

  focusTargetsRef.current = focusLayout?.positions ?? null;
  focusCenterRef.current = focusLayout?.focusCenter ?? null;
  focusBoundsRef.current = focusLayout?.focusBounds ?? null;
  allTreesRef.current = allTrees;
  unidadOrderRef.current = unidadOrder;
  focusUnidadRef.current = focusUnidadId;

  const selectedMeta = selectedId ? byId.get(selectedId) : null;
  camStateRef.current = {
    focusedUnidad: !!focusUnidadId,
    selectedId,
    selectedKind: selectedMeta?.kind ?? null,
  };

  // stage + teleporte al layout en CADA foco (denso necesita grilla ya clavada)
  useEffect(() => {
    if (!focusUnidadId) {
      prevFocusUnidadRef.current = null;
      stageVelRef.current = 0;
      wheelTargetRef.current = 0;
      return;
    }
    const fromHome = !prevFocusUnidadRef.current;
    const order = unidadOrderRef.current;
    const idx = order.indexOf(focusUnidadId);
    if (idx >= 0 && order.length > 0) {
      if (fromHome) {
        stagePhaseRef.current = idx;
        stageTargetRef.current = idx;
      } else {
        const n = order.length;
        const phaseMod = ((stageTargetRef.current % n) + n) % n;
        stageTargetRef.current += cyclicDeltaF(phaseMod, idx, n);
      }
    }
    prevFocusUnidadRef.current = focusUnidadId;
    const u = byId.get(focusUnidadId);
    if (u) wheelTargetRef.current = deltaGiroApex(u.angle);

    const core = nodesRef.current.find((n) => n.kind === "sebin");
    if (core) {
      core.fx = null;
      core.fy = null;
      core.restOverride = null;
    }

    // teleporte solo al entrar desde home (←/→ gira con inercia)
    if (fromHome && idx >= 0) {
      if (userZoomRef.current > 1.2) {
        userZoomRef.current = 1;
        setUserZoomUi(1);
      }
      userPanRef.current = { x: 0, y: 0 };
      const nOrd = order.length;
      const rimOff = (uid: string) => {
        const ti = order.indexOf(uid);
        if (ti < 0 || nOrd === 0) return null;
        return cyclicDeltaF(idx, ti, nOrd);
      };
      for (const d of nodesRef.current) {
        let t: Pt | null = null;
        if (d.kind === "sebin") {
          t =
            allTreesRef.current.get(focusUnidadId)?.positions.get(d.id) ?? null;
        } else {
          const uid =
            d.kind === "unidad"
              ? d.id
              : d.unidadClave
                ? `unidad:${d.unidadClave}`
                : null;
          if (!uid) continue;
          const o = rimOff(uid);
          const tree = allTreesRef.current.get(uid);
          const home = tree?.positions.get(d.id) ?? tree?.positions.get(uid);
          if (o == null || !home) continue;
          t = rotateAbout(home, WHEEL_GEOM.hub, o * WHEEL_GEOM.delta);
        }
        if (!t) continue;
        d.x = t.x;
        d.y = t.y;
        d.vx = 0;
        d.vy = 0;
      }
      setTick((x) => (x + 1) % 1_000_000);
    }
    simRef.current?.alpha(fromHome ? 0.1 : 0.14).restart();
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

    const rimOffset = (unidadId: string): number | null => {
      const order = unidadOrderRef.current;
      const ti = order.indexOf(unidadId);
      if (ti < 0 || order.length === 0) return null;
      const n = order.length;
      const phase = ((stagePhaseRef.current % n) + n) % n;
      return cyclicDeltaF(phase, ti, n);
    };

    /** Rim: apex + flancos con árbol COMPLETO rotado (FounderOS carousel). */
    const rimOf = (d: SimNode): Pt | null => {
      if (!focusUnidadRef.current) return null;
      if (d.kind === "sebin") {
        const apex = allTreesRef.current.get(focusUnidadRef.current);
        return apex?.positions.get(d.id) ?? null;
      }
      const uid =
        d.kind === "unidad"
          ? d.id
          : d.unidadClave
            ? `unidad:${d.unidadClave}`
            : null;
      if (!uid) return null;
      const o = rimOffset(uid);
      if (o === null) return null;
      const tree = allTreesRef.current.get(uid);
      if (!tree) return null;
      const home = tree.positions.get(d.id) ?? tree.positions.get(uid);
      if (!home) return null;
      return rotateAbout(home, WHEEL_GEOM.hub, o * WHEEL_GEOM.delta);
    };

    const targetOf = (d: SimNode): Pt | null => {
      if (focusUnidadRef.current) return rimOf(d);
      if (d.restOverride) return d.restOverride;
      return restHome(d, wheelRef.current);
    };

    const sim = forceSimulation(nodes)
      .velocityDecay(0.72)
      .alphaDecay(0.018)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => {
            const t = typeof l.target === "object" ? l.target : null;
            return t?.kind === "campamento" ? 48 : 84;
          })
          .strength(() => (focusUnidadRef.current ? 0 : 0.28)),
      )
      .force(
        "charge",
        forceManyBody<SimNode>().strength((d) => {
          // en foco: charge OFF — el layout manda (orden FounderOS)
          if (focusUnidadRef.current) return 0;
          return d.kind === "campamento" ? -28 : d.kind === "unidad" ? -90 : -40;
        }),
      )
      .force(
        "radial",
        forceRadial<SimNode>((d) => RING_PX[d.ring], CX, CY).strength(() =>
          focusUnidadRef.current ? 0 : 0.5,
        ),
      )
      .force("x", forceX<SimNode>(CX).strength(0))
      .force("y", forceY<SimNode>(CY).strength(0))
      .force(
        "collide",
        forceCollide<SimNode>((d) => {
          if (focusUnidadRef.current) {
            const apexId = focusUnidadRef.current;
            const inApex =
              d.kind === "sebin" ||
              d.id === apexId ||
              (d.kind === "campamento" &&
                `unidad:${d.unidadClave}` === apexId);
            // apex: radio fijo sin pelear; flancos colapsan
            return inApex ? R_NODE[d.kind] + 2 : 0.5;
          }
          return R_NODE[d.kind] + (d.kind === "campamento" ? 3 : 6);
        }),
      )
      .on("tick", renderTick);

    let stageNodes: SimNode[] = nodes;
    const stageForce = Object.assign(
      (alpha: number) => {
        const focused = !!focusUnidadRef.current;
        const apexId = focusUnidadRef.current;
        for (const d of stageNodes) {
          if (d.fx != null || d.fy != null) continue;
          const t = targetOf(d);
          if (!t) continue;
          const inApex =
            focused &&
            (d.kind === "sebin" ||
              d.id === apexId ||
              (d.kind === "campamento" &&
                `unidad:${d.unidadClave}` === apexId));
          // apex y flancos: pull fuerte + snap (abanico ordenado, no nube)
          const k = (focused ? (inApex ? 0.98 : 0.92) : 0.42) * alpha;
          const dx = t.x - (d.x ?? 0);
          const dy = t.y - (d.y ?? 0);
          const snap = focused ? 2.2 : 0;
          if (snap && Math.hypot(dx, dy) < snap) {
            d.x = t.x;
            d.y = t.y;
            d.vx = 0;
            d.vy = 0;
            continue;
          }
          d.vx = (d.vx ?? 0) + dx * k;
          d.vy = (d.vy ?? 0) + dy * k;
        }
      },
      { initialize: (ns: SimNode[]) => { stageNodes = ns; } },
    );
    sim.force("stage", stageForce);

    simRef.current = sim;
    sim.alpha(0.75).restart();

    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topoKey]);

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

      // ease wheel (más lento = más fluido)
      const wd = wheelTargetRef.current - wheelRef.current;
      if (Math.abs(wd) > 0.0005) {
        wheelRef.current += wd * (reduced ? 1 : 0.055);
        simRef.current?.alpha(Math.max(simRef.current.alpha(), 0.05)).restart();
      } else {
        wheelRef.current = wheelTargetRef.current;
      }

      // stage phase con inercia (rueda grande que gira, no spring)
      if (focusUnidadRef.current) {
        const sd = stageTargetRef.current - stagePhaseRef.current;
        if (reduced) {
          stagePhaseRef.current = stageTargetRef.current;
          stageVelRef.current = 0;
        } else {
          stageVelRef.current += (sd * 0.055 - stageVelRef.current) * 0.07;
          if (Math.abs(sd) > 0.0008 || Math.abs(stageVelRef.current) > 0.0003) {
            stagePhaseRef.current += stageVelRef.current;
            simRef.current
              ?.alpha(Math.max(simRef.current.alpha(), 0.05))
              .restart();
          } else {
            stagePhaseRef.current = stageTargetRef.current;
            stageVelRef.current = 0;
          }
        }
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
  const focusIdx = focusUnidadId ? unidadOrder.indexOf(focusUnidadId) : -1;
  const goUnidad = (dir: -1 | 1) => {
    if (unidadOrder.length === 0) return;
    const i =
      focusIdx < 0
        ? 0
        : (focusIdx + dir + unidadOrder.length) % unidadOrder.length;
    const id = unidadOrder[i];
    setFocusUnidadId(id);
    const node = byId.get(id);
    if (node) onSelect(node);
    // no reset zoom — la rueda gira bajo la cámara
  };

  const rimOffsetOf = (unidadId: string): number | null => {
    if (!focusUnidadId) return null;
    const ti = unidadOrder.indexOf(unidadId);
    if (ti < 0 || unidadOrder.length === 0) return null;
    const n = unidadOrder.length;
    const phase = ((stagePhaseRef.current % n) + n) % n;
    return cyclicDeltaF(phase, ti, n);
  };
  const focusId = hoverId ?? selectedId;
  const focusNode = focusId ? byId.get(focusId) : undefined;

  /** Opacidad por rim: apex 1, flancos ~0.55, resto 0 (abanico navegable). */
  const nodeOpacity = (n: SebinBrainNode): number => {
    if (!focusUnidadId) {
      if (!focusNode || focusNode.kind === "sebin") return 1;
      if (n.id === focusNode.id || n.kind === "sebin") return 1;
      if (focusNode.kind === "unidad") {
        return n.unidadClave === focusNode.unidadClave || n.id === focusNode.id
          ? 1
          : 0.18;
      }
      return n.id === `unidad:${focusNode.unidadClave}` ? 1 : 0.18;
    }
    if (n.kind === "sebin") return 1;
    const uid =
      n.kind === "unidad"
        ? n.id
        : n.unidadClave
          ? `unidad:${n.unidadClave}`
          : null;
    if (!uid) return 0;
    const o = rimOffsetOf(uid);
    if (o === null) return 0;
    const abs = Math.abs(o);
    if (n.kind === "unidad") {
      if (abs < APEX_EPS) return 1;
      if (abs <= RIM_VISIBLE) return 0.58;
      return 0;
    }
    // camps: apex pleno; flanco whisper (abanico lateral preparado)
    if (abs < APEX_EPS) return 1;
    if (abs <= RIM_VISIBLE) return 0.2;
    return 0;
  };

  const dimmed = (n: SebinBrainNode): boolean => nodeOpacity(n) < 0.95;

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

  const focusPt = (id: string): Pt | null => {
    if (id.startsWith("limb:")) {
      const campId = id.slice("limb:".length);
      const camp = nodesRef.current.find((n) => n.id === campId);
      if (!camp?.unidadClave) return null;
      // si camp flanco está oculto (op~0), no dibujar limb
      if (nodeOpacity(camp) < 0.05) return null;
      const unidad = nodesRef.current.find(
        (n) => n.id === `unidad:${camp.unidadClave}`,
      );
      if (!unidad) return null;
      const ux = unidad.x ?? CX;
      const uy = unidad.y ?? CY;
      const cx = camp.x ?? ux;
      const cy = camp.y ?? uy;
      return { x: cx, y: uy + (cy - uy) * 0.48 };
    }
    const n = nodesRef.current.find((m) => m.id === id);
    if (!n) return null;
    return { x: n.x ?? CX, y: n.y ?? CY };
  };

  const pathLit = (branchTarget: string, branchSource: string): boolean => {
    if (!selectedId) return false;
    if (selectedId === focusUnidadId) {
      return (
        branchSource === SEBIN_BRAIN_CORE_ID ||
        branchTarget === focusUnidadId
      );
    }
    if (byId.get(selectedId)?.kind === "campamento") {
      const lid = limbIdForCamp(selectedId);
      return (
        branchTarget === selectedId ||
        branchTarget === lid ||
        (branchSource === SEBIN_BRAIN_CORE_ID &&
          branchTarget === focusUnidadId) ||
        (branchSource === focusUnidadId && branchTarget === lid) ||
        (branchSource === lid && branchTarget === selectedId)
      );
    }
    return false;
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
              Volver
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Unidad anterior"
              onClick={() => goUnidad(-1)}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Unidad siguiente"
              onClick={() => goUnidad(1)}
            >
              <ArrowRight className="size-3.5" />
            </Button>
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold backdrop-blur"
              style={{
                borderColor: focusNodeMeta?.color,
                color: focusNodeMeta?.color,
                background: "color-mix(in oklab, var(--background) 85%, transparent)",
              }}
            >
              {focusNodeMeta?.label ?? "Unidad"}
              <button
                type="button"
                className="rounded-sm opacity-70 hover:opacity-100"
                aria-label="Cerrar foco"
                onClick={clearFocus}
              >
                <X className="size-3" />
              </button>
            </span>
          </>
        )}
      </div>

      {/* flechas laterales tipo FounderOS (solo en foco) */}
      {focusUnidadId && (
        <>
          <button
            type="button"
            aria-label="Unidad anterior"
            onClick={() => goUnidad(-1)}
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border bg-background/70 p-3 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Unidad siguiente"
            onClick={() => goUnidad(1)}
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border bg-background/70 p-3 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <ArrowRight className="size-5" />
          </button>
        </>
      )}

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
          @keyframes sebin-dash-move { to { stroke-dashoffset: -8.5; } }
          @keyframes sebin-grow {
            from { stroke-dashoffset: 1; }
            to { stroke-dashoffset: 0; }
          }
          .sebin-dash {
            stroke-dasharray: 1.5 7;
            animation: sebin-dash-move 1s linear infinite;
          }
          .sebin-grow {
            stroke-dasharray: 1;
            stroke-dashoffset: 1;
            animation: sebin-grow 1.1s ease forwards;
          }
          @media (prefers-reduced-motion: reduce) {
            .sebin-core-glow, .sebin-crit-halo, .sebin-ray,
            .sebin-dash, .sebin-grow { animation: none; }
            .sebin-grow { stroke-dashoffset: 0; }
          }
        `}</style>

        {/* radar / anillos espectaculares (FounderOS orbitalRings) */}
        {(() => {
          const gc = focusUnidadId ? FOCUS_WHEEL.hub : { x: CX, y: CY };
          const gk = focusUnidadId ? FOCUS_WHEEL.scale : 1;
          const glide = {
            transition:
              "cx 900ms cubic-bezier(0.22,1,0.36,1), cy 900ms cubic-bezier(0.22,1,0.36,1), r 900ms cubic-bezier(0.22,1,0.36,1), opacity 500ms ease",
          } as const;
          const accent = focusNodeMeta?.color ?? "var(--primary)";
          return (
            <g aria-hidden>
              {/* glow central — home o aparato bajo en foco */}
              <circle
                cx={gc.x}
                cy={gc.y}
                r={(focusUnidadId ? ORBIT_R[3] : SCALE * 0.95) * gk}
                fill="url(#sebinCoreGlow)"
                opacity={focusUnidadId ? 0.35 : 0.55}
                style={glide}
              />
              {/* halo tintado del color de unidad en foco */}
              {focusUnidadId && (
                <circle
                  cx={gc.x}
                  cy={gc.y}
                  r={ORBIT_R[2] * gk}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1.2}
                  opacity={0.14}
                  style={glide}
                />
              )}
              {/* anillos sólidos suaves */}
              <circle
                cx={gc.x}
                cy={gc.y}
                r={((ORBIT_R[1] + ORBIT_R[2]) / 2) * gk}
                fill="none"
                stroke="var(--border)"
                strokeWidth="1"
                opacity={0.28}
                style={glide}
              />
              <circle
                cx={gc.x}
                cy={gc.y}
                r={((ORBIT_R[2] + ORBIT_R[3]) / 2) * gk}
                fill="none"
                stroke="var(--border)"
                strokeWidth="1"
                opacity={0.2}
                style={glide}
              />
              {/* dashed que giran en home; en foco quedan fijos con el aparato */}
              <g opacity={focusUnidadId ? 0.5 : 0.58}>
                {!focusUnidadId && (
                  <animateTransform
                    attributeName="transform"
                    attributeType="XML"
                    type="rotate"
                    from={`0 ${CX} ${CY}`}
                    to={`360 ${CX} ${CY}`}
                    dur="150s"
                    repeatCount="indefinite"
                  />
                )}
                {ORBIT_R.map((r) => (
                  <circle
                    key={r}
                    cx={gc.x}
                    cy={gc.y}
                    r={r * gk}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="1"
                    strokeDasharray="2 6"
                    style={glide}
                  />
                ))}
              </g>
            </g>
          );
        })()}

        {/* red radial: oculta en foco — el árbol dibuja sus propias ramas */}
        {!focusUnidadId && (
          <g>
            {links.map((l, i) => {
              const ends = linkEnds(l);
              if (!ends) return null;
              const { sx, sy, tx, ty, sourceId, targetId } = ends;
              const active = edgeActive(sourceId, targetId);
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
        )}

        {/* árbol apex + flancos en rim */}
        {focusUnidadId && focusLayout && (
          <g style={{ pointerEvents: "none" }}>
            <defs>
              <radialGradient id="sebinFocusGlow" cx="50%" cy="50%" r="50%">
                <stop
                  offset="0%"
                  stopColor={focusNodeMeta?.color ?? "var(--primary)"}
                  stopOpacity="0.18"
                />
                <stop
                  offset="55%"
                  stopColor={focusNodeMeta?.color ?? "var(--primary)"}
                  stopOpacity="0.05"
                />
                <stop
                  offset="100%"
                  stopColor={focusNodeMeta?.color ?? "var(--primary)"}
                  stopOpacity="0"
                />
              </radialGradient>
            </defs>
            <circle
              cx={VB_W / 2}
              cy={VB_H * 0.5}
              r={VB_W * 0.55}
              fill="url(#sebinFocusGlow)"
            />

            {/* flancos: árbol ya expandido en el arco (Sales/Clients ref) */}
            <g opacity={0.28}>
              {[...flankUnidades].map((uid) => {
                const tree = allTrees.get(uid);
                if (!tree) return null;
                const color = byId.get(uid)?.color ?? "var(--muted-foreground)";
                return (
                  <g key={`fl-tree-${uid}`}>
                    {tree.branches
                      .filter((b) => b.source !== SEBIN_BRAIN_CORE_ID)
                      .map((b, i) => {
                        const s = focusPt(b.source);
                        const t = focusPt(b.target);
                        if (!s || !t) return null;
                        return (
                          <path
                            key={`fl-${uid}-${i}`}
                            d={branchPath(s, t)}
                            fill="none"
                            stroke={color}
                            strokeWidth={branchWidth(b.depth) * 0.8}
                            strokeLinecap="round"
                          />
                        );
                      })}
                  </g>
                );
              })}
            </g>

            {/* apex: tronco + abanico (denso = ramas más tenues) */}
            <g key={focusUnidadId}>
              {focusLayout.branches.map((b, i) => {
                const s = focusPt(b.source);
                const t = focusPt(b.target);
                if (!s || !t) return null;
                const d = branchPath(s, t);
                const lit = pathLit(b.target, b.source);
                const accent = focusNodeMeta?.color ?? "var(--primary)";
                const denseFade = focusLayout.dense ? 0.28 : 0.5;
                if (b.depth === 2) {
                  return (
                    <path
                      key={`br-${i}`}
                      d={d}
                      fill="none"
                      stroke={lit ? accent : "var(--foreground)"}
                      strokeWidth={
                        branchWidth(2) * (lit ? 1.3 : focusLayout.dense ? 0.75 : 1)
                      }
                      strokeLinecap="round"
                      opacity={lit ? 0.95 : denseFade}
                      className="sebin-dash"
                    />
                  );
                }
                if (b.depth === 3) {
                  return (
                    <path
                      key={`br-${i}`}
                      d={d}
                      fill="none"
                      stroke={lit ? accent : "var(--muted-foreground)"}
                      strokeWidth={branchWidth(3) * (lit ? 1.35 : 1)}
                      strokeLinecap="round"
                      opacity={lit ? 0.95 : 0.55}
                    />
                  );
                }
                return (
                  <path
                    key={`br-${i}`}
                    d={d}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth={branchWidth(1)}
                    strokeLinecap="round"
                    pathLength={1}
                    className="sebin-grow"
                  />
                );
              })}
              {!focusLayout.dense &&
                focusLayout.limbs.map((limb) => {
                  const p = focusPt(limb.id);
                  if (!p) return null;
                  const lit =
                    selectedId === limb.campId || hoverId === limb.campId;
                  return (
                    <g key={limb.id} transform={`translate(${p.x} ${p.y})`}>
                      <circle
                        r={lit ? 3 : 2.2}
                        fill={
                          lit
                            ? (focusNodeMeta?.color ?? "var(--primary)")
                            : "var(--foreground)"
                        }
                        opacity={lit ? 0.95 : 0.35}
                      />
                    </g>
                  );
                })}
            </g>
          </g>
        )}

        {!focusUnidadId && (
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
        )}

        <g>
          {[...nodes]
            .sort((a, b) => a.ring - b.ring)
            .map((n) => {
              const op = nodeOpacity(n);
              if (op <= 0.01) return null;
              const x = n.x ?? CX;
              const y = n.y ?? CY;
              const isFocusHub = focusUnidadId === n.id && n.kind === "unidad";
              const isFlankHub =
                !!focusUnidadId &&
                n.kind === "unidad" &&
                flankUnidades.has(n.id);
              const inApexCamp =
                !!focusUnidadId &&
                n.kind === "campamento" &&
                `unidad:${n.unidadClave}` === focusUnidadId;
              const r =
                n.kind === "unidad" && isFocusHub
                  ? R_NODE.unidad * 1.45
                  : n.kind === "unidad" && isFlankHub
                    ? R_NODE.unidad * 1.15
                    : inApexCamp
                      ? R_NODE.campamento * 1.45
                      : R_NODE[n.kind];
              const isSel = selectedId === n.id;
              const isHover = hoverId === n.id;
              const fade = dimmed(n);
              const sevColor = META_SEVERIDAD_BRAIN[n.severidad].color;
              const fill = n.kind === "unidad" ? n.color : sevColor;
              const showUnidadLabel = n.kind === "unidad";
              // labels solo si hay espacio (≥64px) o hover/sel — nunca blob
              // denso (10+): NUNCA labels automáticos — solo hover/sel
              const showCampLabel =
                n.kind === "campamento" &&
                (isHover ||
                  isSel ||
                  (inApexCamp && focusLayout?.labelsReadable === true));
              const campName =
                n.kind === "campamento"
                  ? n.label.length > 16
                    ? `${n.label.slice(0, 14).trimEnd()}…`
                    : n.label
                  : "";
              return (
                <g
                  key={n.id}
                  transform={`translate(${x} ${y})`}
                  opacity={op}
                  style={{
                    cursor: draggingId === n.id ? "grabbing" : "grab",
                    transition: "opacity 0.45s ease",
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
                      stroke={
                        isSel && focusUnidadId
                          ? (focusNodeMeta?.color ?? "var(--foreground)")
                          : "var(--foreground)"
                      }
                      strokeWidth="1.5"
                      opacity="0.85"
                    />
                  )}
                  {n.kind === "sebin" ? (
                    <>
                      <circle r={44} fill="transparent" />
                      <SebinNeuralCore
                        radius={34}
                        color={sevColor}
                        label="SEBIN"
                      />
                    </>
                  ) : (
                    <circle
                      r={r}
                      fill={fill}
                      stroke="var(--background)"
                      strokeWidth={isFocusHub ? 2 : 1.4}
                      filter={
                        n.severidad === "critica" || isFocusHub
                          ? "url(#brainSoftGlow)"
                          : undefined
                      }
                    />
                  )}
                  {showUnidadLabel && (
                    <text
                      y={r + (isFocusHub || isFlankHub ? 14 : 12)}
                      textAnchor="middle"
                      style={{
                        fontSize: isFocusHub ? 10 : isFlankHub ? 9 : 8,
                        fontWeight: isFocusHub ? 700 : 600,
                        fill:
                          isFocusHub || isFlankHub
                            ? n.color
                            : "var(--foreground)",
                        pointerEvents: "none",
                      }}
                    >
                      {isFocusHub || isFlankHub ? n.label : shortLabel(n)}
                    </text>
                  )}
                  {n.kind === "unidad" && !focusUnidadId && (
                    <text
                      y={r + 22}
                      textAnchor="middle"
                      className="fill-muted-foreground"
                      style={{ fontSize: 7.5, pointerEvents: "none" }}
                    >
                      {n.criticos > 0
                        ? `${n.criticos} crítica${n.criticos === 1 ? "" : "s"}`
                        : `${n.reportesOk}/${n.camps} ok`}
                    </text>
                  )}
                  {showCampLabel && (
                    <text
                      y={r + (inApexCamp ? 12 : 11)}
                      textAnchor="middle"
                      style={{
                        fontSize: inApexCamp
                          ? (focusLayout?.limbs.length ?? 0) > 12
                            ? 7
                            : 8.5
                          : 8,
                        fontWeight: 600,
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fill: "var(--foreground)",
                        opacity: inApexCamp ? 0.92 : 1,
                        pointerEvents: "none",
                      }}
                    >
                      {campName || shortLabel(n)}
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
