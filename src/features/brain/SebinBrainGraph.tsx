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
  centroIdDeNodoOperador,
  nodosOperadorDeCamp,
  type OperadorBrain,
  type SebinBrainEdge,
  type SebinBrainGraph,
  type SebinBrainNode,
  type SeveridadBrain,
} from "@/domain/sebinBrainGraph";
import {
  CAM_EASE,
  CAM_EASE_ENTER_FOCUS,
  CAM_EASE_EXPAND,
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
  layoutFocoCampamento,
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
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Minus,
  Plus,
  Scan,
  X,
} from "lucide-react";
import type { FiltroReporteBrain } from "./FiltrosReporteBrain";
import { SebinNeuralCore } from "./SebinNeuralCore";

const USER_ZOOM_MIN = 0.35;
const USER_ZOOM_MAX = 3.2;
/** Duración animación núcleo → red completa (reveal + asentamiento). */
const EXPAND_MS = 3200;
/** Impulso radial suave al expandir (antes 3.2 = demasiado violento). */
const EXPAND_BURST_V = 0.95;
const EXPAND_ALPHA = 0.48;
const EXPAND_ALPHA_TARGET = 0.05;
const EXPAND_COOL_MS = 1400;
const CORE_R_SOLO = 78;
const CORE_R_RED = 34;

function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Reveal progresivo: arranca suave, florece, aterriza. */
function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x ** 3 : 1 - ((-2 * x + 2) ** 3) / 2;
}

const VB_W = 1000;
const VB_H = 720;
const CX = VB_W / 2;
const CY = VB_H / 2;
const SCALE = 340;

const RING_PX: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: SCALE * 0.42,
  2: SCALE * 0.82,
  3: SCALE * 1.12,
};

const R_NODE: Record<SebinBrainNode["kind"], number> = {
  sebin: 36,
  unidad: 17,
  campamento: 7.5,
  operador: 4.2,
};

const OPS_EMPTY: Map<string, OperadorBrain[]> = new Map();

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

/** Nube suave + impulso leve hacia el anillo (no explosión desde el centro). */
function seedExpandBurst(
  nodes: SimNode[],
  sim: Simulation<SimNode, SimLink> | null,
) {
  for (const d of nodes) {
    if (d.kind === "sebin") continue;
    const a = d.angle ?? 0;
    const seed = 16 + Math.abs(Math.sin(a * 12.9898)) * 28;
    d.x = CX + Math.cos(a) * seed;
    d.y = CY + Math.sin(a) * seed;
    d.vx = Math.cos(a) * EXPAND_BURST_V;
    d.vy = Math.sin(a) * EXPAND_BURST_V;
    d.fx = null;
    d.fy = null;
  }
  sim?.alpha(EXPAND_ALPHA).alphaTarget(EXPAND_ALPHA_TARGET).restart();
}

function shortLabel(n: SebinBrainNode): string {
  if (n.kind === "campamento" && n.label.length > 18) {
    return `${n.label.slice(0, 16).trimEnd()}…`;
  }
  if (n.kind === "unidad" && n.label.length > 16) {
    return `${n.label.slice(0, 14).trimEnd()}…`;
  }
  return n.label;
}

/** Label de camp en abanico: denso → N.º o nombre muy corto; hover → nombre. */
function opFanLabel(n: SebinBrainNode, emphasize: boolean): string {
  const base = n.label.trim();
  const first = base.split(/\s+/)[0] ?? base;
  if (emphasize) {
    if (base.length > 16) return `${base.slice(0, 14).trimEnd()}…`;
    return base;
  }
  if (first.length > 10) return `${first.slice(0, 9).trimEnd()}…`;
  return first;
}

function campFanLabel(
  n: SebinBrainNode,
  opts: { dense: boolean; emphasize: boolean },
): string {
  if (opts.emphasize || !opts.dense) {
    if (n.label.length > 16) return `${n.label.slice(0, 14).trimEnd()}…`;
    return n.label;
  }
  // denso: N.° cabe; si no, nombre ≤10
  if (n.sublabel && /^N\.?\s*°?\s*\d/i.test(n.sublabel)) return n.sublabel;
  if (n.label.length > 10) return `${n.label.slice(0, 9).trimEnd()}…`;
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
  focusUnidadId,
  onFocusUnidadIdChange,
  operadoresPorCentro = OPS_EMPTY,
  ocultarChromeFlotante = false,
  /** Incrementar desde padre: expandir red + zoom/pan a home. */
  vistaResetKey = 0,
  className,
}: {
  graph: SebinBrainGraph;
  selectedId: string | null;
  onSelect: (node: SebinBrainNode | null) => void;
  /** Foco de unidad controlado por la vista (panel/lista/migas). */
  focusUnidadId: string | null;
  onFocusUnidadIdChange: (id: string | null) => void;
  /** Operadores por centro. Overlay al seleccionar camp; no entran a d3-force. */
  operadoresPorCentro?: Map<string, OperadorBrain[]>;
  /** Oculta zoom/migas/flechas (p. ej. panel lista abierto en móvil). */
  ocultarChromeFlotante?: boolean;
  vistaResetKey?: number;
  className?: string;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** Siempre expandida al cargar; false solo si algún path legacy colapsa. */
  const [redExpandida, setRedExpandida] = useState(true);
  /** false inicial → el effect dispara explosión radial al montar. */
  const prevRedExpandidaRef = useRef(false);
  /** Inicio de la explosión radial (null = idle). */
  const expandAnimRef = useRef<{ start: number } | null>(null);
  const setFocusUnidadId = (
    next: string | null | ((prev: string | null) => string | null),
  ) => {
    onFocusUnidadIdChange(
      typeof next === "function" ? next(focusUnidadId) : next,
    );
  };
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
    /** Touch: arrastrar nodo = pan lienzo (tap corto = click). */
    touchPan?: boolean;
  } | null>(null);
  /** Pellizco activo — ignora pan de un dedo. */
  const pinchRef = useRef<{
    dist0: number;
    zoom0: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const focusTargetsRef = useRef<Map<string, Pt> | null>(null);
  const focusCenterRef = useRef<Pt | null>(null);
  const focusBoundsRef = useRef<Bounds | null>(null);
  const allTreesRef = useRef<Map<string, FocusLayoutResult>>(new Map());
  const unidadOrderRef = useRef<string[]>([]);
  const focusUnidadRef = useRef<string | null>(null);
  const opsBoundsRef = useRef<Bounds | null>(null);
  const stagePhaseRef = useRef(0);
  const stageTargetRef = useRef(0);
  const stageVelRef = useRef(0);
  const prevFocusUnidadRef = useRef<string | null>(null);
  /** Hasta este ts: pull suave overview→foco (sin teleporte). */
  const enterFocusSoftUntilRef = useRef(0);
  const wheelRef = useRef(0);
  const wheelTargetRef = useRef(0);
  const camStateRef = useRef({
    focusedUnidad: false,
    selectedId: null as string | null,
    selectedKind: null as "campamento" | "unidad" | "sebin" | "operador" | null,
    coreSolo: false,
  });
  const redExpandidaRef = useRef(true);
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

  const selectedCampId = useMemo(() => {
    if (!selectedId) return null;
    if (selectedId.startsWith("camp:")) return selectedId;
    const c = centroIdDeNodoOperador(selectedId);
    return c ? `camp:${c}` : null;
  }, [selectedId]);

  const selectedCampNode = useMemo(
    () =>
      selectedCampId
        ? (graph.nodes.find((n) => n.id === selectedCampId) ?? null)
        : null,
    [graph.nodes, selectedCampId],
  );

  const opsBundle = useMemo(() => {
    if (!selectedCampNode?.centroId) return { nodes: [] as SebinBrainNode[], edges: [] as SebinBrainEdge[] };
    const ops = operadoresPorCentro.get(selectedCampNode.centroId) ?? [];
    return nodosOperadorDeCamp(selectedCampNode, ops);
  }, [selectedCampNode, operadoresPorCentro]);

  const byId = useMemo(() => {
    const m = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const n of opsBundle.nodes) m.set(n.id, n);
    return m;
  }, [graph.nodes, opsBundle.nodes]);

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

  const campSim = selectedCampNode
    ? nodesRef.current.find((n) => n.id === selectedCampNode.id)
    : null;
  const unidadSim = selectedCampNode?.unidadClave
    ? nodesRef.current.find(
        (n) => n.id === `unidad:${selectedCampNode.unidadClave}`,
      )
    : null;
  const opsLayout =
    campSim && selectedCampNode && opsBundle.nodes.length > 0
      ? layoutFocoCampamento({
          campId: selectedCampNode.id,
          camp: { x: campSim.x ?? CX, y: campSim.y ?? CY },
          unidad: unidadSim
            ? { x: unidadSim.x ?? CX, y: unidadSim.y ?? CY }
            : null,
          ops: opsBundle.nodes.map((n) => ({ id: n.id })),
        })
      : null;
  opsBoundsRef.current = opsLayout?.bounds ?? null;

  redExpandidaRef.current = redExpandida;
  camStateRef.current = {
    focusedUnidad: !!focusUnidadId,
    selectedId,
    selectedKind: selectedMeta?.kind ?? null,
    coreSolo: !redExpandida,
  };

  // Lista/navegación externa → expandir red
  useEffect(() => {
    if (focusUnidadId) setRedExpandida(true);
  }, [focusUnidadId]);
  useEffect(() => {
    if (selectedId?.startsWith("camp:") || selectedId?.startsWith("op:")) {
      setRedExpandida(true);
    }
  }, [selectedId]);

  // Explosión radial al pasar de núcleo → red
  useEffect(() => {
    const was = prevRedExpandidaRef.current;
    prevRedExpandidaRef.current = redExpandida;
    if (!redExpandida) {
      expandAnimRef.current = null;
      return;
    }
    if (was) return; // ya estaba expandida

    expandAnimRef.current = { start: performance.now() };
    userZoomRef.current = 1;
    userPanRef.current = { x: 0, y: 0 };
    setUserZoomUi(1);

    seedExpandBurst(nodesRef.current, simRef.current);
    const cool = window.setTimeout(() => {
      simRef.current?.alphaTarget(0);
    }, EXPAND_COOL_MS);

    const endAt = performance.now() + EXPAND_MS + 80;
    let raf = 0;
    const pump = () => {
      setTick((x) => (x + 1) % 1_000_000);
      if (performance.now() < endAt) {
        raf = requestAnimationFrame(pump);
      } else {
        expandAnimRef.current = null;
        setTick((x) => (x + 1) % 1_000_000);
      }
    };
    raf = requestAnimationFrame(pump);

    return () => {
      window.clearTimeout(cool);
      cancelAnimationFrame(raf);
      // Strict Mode remount: re-disparar explosión si cleanup corta anim a medias
      if (expandAnimRef.current) {
        prevRedExpandidaRef.current = false;
        expandAnimRef.current = null;
      }
    };
  }, [redExpandida]);

  // stage + teleporte al layout en CADA foco (denso necesita grilla ya clavada)
  useEffect(() => {
    if (!focusUnidadId) {
      prevFocusUnidadRef.current = null;
      stageVelRef.current = 0;
      wheelTargetRef.current = 0;
      enterFocusSoftUntilRef.current = 0;
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

    // Entrada desde overview: viaje fluido (sin teleporte). Reduced-motion sí clava.
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
      const teleportToFocus = () => {
        for (const d of nodesRef.current) {
          let t: Pt | null = null;
          if (d.kind === "sebin") {
            t =
              allTreesRef.current.get(focusUnidadId)?.positions.get(d.id) ??
              null;
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
      };
      if (reducedRef.current) {
        teleportToFocus();
        enterFocusSoftUntilRef.current = 0;
      } else {
        enterFocusSoftUntilRef.current = performance.now() + 1300;
      }
    }
    simRef.current?.alpha(fromHome ? 0.62 : 0.14).restart();
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
        const softEnter =
          focused && performance.now() < enterFocusSoftUntilRef.current;
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
          // overview→foco: pull suave; luego snap fuerte (abanico ordenado)
          const pull = focused
            ? softEnter
              ? inApex
                ? 0.28
                : 0.2
              : inApex
                ? 0.98
                : 0.92
            : 0.42;
          const k = pull * alpha;
          const dx = t.x - (d.x ?? 0);
          const dy = t.y - (d.y ?? 0);
          const snap = focused && !softEnter ? 2.2 : 0;
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

    // Montaje con expand: burst suave (sin alpha 0.75 previo = doble patada)
    let burstCool: number | undefined;
    if (expandAnimRef.current) {
      seedExpandBurst(nodes, sim);
      burstCool = window.setTimeout(() => {
        simRef.current?.alphaTarget(0);
      }, EXPAND_COOL_MS);
    } else {
      sim.alpha(0.75).restart();
    }

    return () => {
      if (burstCool != null) window.clearTimeout(burstCool);
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
      const focusUnidadIdNow = focusUnidadRef.current;
      const focusUnidadLayoutPos = focusUnidadIdNow
        ? (focusTargetsRef.current?.get(focusUnidadIdNow) ?? null)
        : null;
      const target = cameraRect(
        { w: VB_W, h: VB_H },
        {
          focusedUnidad: c.focusedUnidad,
          selectedKind: c.selectedKind,
          selectedNodePos: posOf(c.selectedId),
          focusUnidadPos: focusUnidadLayoutPos ?? posOf(focusUnidadIdNow),
          focusCenter: focusCenterRef.current,
          focusBounds: focusBoundsRef.current,
          campOpsBounds: opsBoundsRef.current,
          coreSolo: c.coreSolo,
          corePos: { x: CX, y: CY },
        },
      );
      const goingHome =
        !c.coreSolo && !c.focusedUnidad && !c.selectedId;
      const enteringFocus =
        c.focusedUnidad &&
        performance.now() < enterFocusSoftUntilRef.current;
      const exploding =
        expandAnimRef.current != null &&
        performance.now() - expandAnimRef.current.start < EXPAND_MS;
      const ease = reduced
        ? 1
        : exploding
          ? CAM_EASE_EXPAND
          : c.coreSolo || goingHome
            ? CAM_EASE_HOME
            : enteringFocus
              ? CAM_EASE_ENTER_FOCUS
              : CAM_EASE;
      const next = lerpRect(cur, target, ease);
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

  // Escape: foco unidad → overview (ya no colapsa al núcleo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedId?.startsWith("op:")) {
        const camp = selectedCampId ? byId.get(selectedCampId) : null;
        onSelect(camp ?? null);
        return;
      }
      if (selectedMeta?.kind === "campamento" && focusUnidadId) {
        const u = byId.get(focusUnidadId);
        onSelect(u ?? null);
        return;
      }
      if (focusUnidadId) {
        setFocusUnidadId(null);
        onSelect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusUnidadId, selectedId, selectedCampId, selectedMeta?.kind, byId, onSelect]);

  // ── drag / pan táctil ─────────────────────────────────────────────────
  const simNode = (id: string) => nodesRef.current.find((n) => n.id === id) ?? null;
  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  const beginPanDrag = (
    e: React.PointerEvent,
    captureEl: Element = e.currentTarget as Element,
  ) => {
    if (pinchRef.current) return;
    try {
      captureEl.setPointerCapture?.(e.pointerId);
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

  const movePanDrag = (clientX: number, clientY: number, threshold = 3) => {
    const drag = panDragRef.current;
    if (!drag || pinchRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const base = baseCamRef.current;
    const z = userZoomRef.current;
    const worldPerPxX = base.w / z / Math.max(1, rect.width);
    const worldPerPxY = base.h / z / Math.max(1, rect.height);
    const dx = clientX - drag.startClientX;
    const dy = clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) > threshold) drag.moved = true;
    userPanRef.current = {
      x: drag.originPanX - dx * worldPerPxX,
      y: drag.originPanY - dy * worldPerPxY,
    };
  };

  const endPanDrag = (e: React.PointerEvent, releaseEl?: Element) => {
    const drag = panDragRef.current;
    if (!drag) return;
    try {
      (releaseEl ?? (e.currentTarget as Element)).releasePointerCapture?.(
        e.pointerId,
      );
    } catch {
      /* best-effort */
    }
    if (drag.moved) suppressClickRef.current = true;
    panDragRef.current = null;
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    // Dedo: pan del lienzo (no rearrastrar nodos del force layout)
    if (e.pointerType === "touch") {
      beginPanDrag(e);
      dragRef.current = {
        id,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        touchPan: true,
      };
      return;
    }
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
    if (drag.touchPan) {
      movePanDrag(e.clientX, e.clientY, 8);
      if (panDragRef.current?.moved) drag.moved = true;
      return;
    }
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
    if (drag.touchPan) {
      endPanDrag(e);
      if (drag.moved) suppressClickRef.current = true;
      dragRef.current = null;
      return;
    }
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

  /** Padre pide home: red expandida + cámara centrada. */
  useEffect(() => {
    if (vistaResetKey === 0) return;
    setRedExpandida(true);
    resetUserView();
  }, [vistaResetKey]);

  // wheel + pellizco: no-passive para no scrollear la página
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.12;
      setUserZoom(userZoomRef.current * factor, { x: e.clientX, y: e.clientY });
    };

    const touchDist = (t: TouchList) =>
      Math.hypot(
        t[0].clientX - t[1].clientX,
        t[0].clientY - t[1].clientY,
      );
    const touchMid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        panDragRef.current = null;
        dragRef.current = null;
        const d = touchDist(e.touches);
        if (d > 0) {
          pinchRef.current = { dist0: d, zoom0: userZoomRef.current };
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (e.touches.length >= 2 && pinch && pinch.dist0 > 0) {
        e.preventDefault();
        const d = touchDist(e.touches);
        const mid = touchMid(e.touches);
        setUserZoom(pinch.zoom0 * (d / pinch.dist0), mid);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("touchstart", onTouchStart, { passive: false });
    svg.addEventListener("touchmove", onTouchMove, { passive: false });
    svg.addEventListener("touchend", onTouchEnd);
    svg.addEventListener("touchcancel", onTouchEnd);
    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("touchstart", onTouchStart);
      svg.removeEventListener("touchmove", onTouchMove);
      svg.removeEventListener("touchend", onTouchEnd);
      svg.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const onBgPointerDown = (e: React.PointerEvent) => {
    // solo fondo (no nodos)
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== "svg") {
      // permitir pan desde el rect de hit transparente
      const el = e.target as Element;
      if (!el.classList?.contains("sebin-pan-surface")) return;
    }
    beginPanDrag(e);
  };

  const onBgPointerMove = (e: React.PointerEvent) => {
    movePanDrag(
      e.clientX,
      e.clientY,
      e.pointerType === "touch" ? 8 : 3,
    );
  };

  const onBgPointerUp = (e: React.PointerEvent) => {
    endPanDrag(e);
  };

  const onNodeClick = (n: SebinBrainNode) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (n.kind === "operador") {
      onSelect(n);
      return;
    }
    if (n.kind === "sebin") {
      if (focusUnidadId) {
        // Sale del foco unidad; queda overview expandido
        setFocusUnidadId(null);
        onSelect(null);
      }
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
  const selectedCampMeta =
    selectedMeta?.kind === "campamento"
      ? selectedMeta
      : selectedMeta?.kind === "operador"
        ? selectedCampNode
        : null;
  const focusIdx = focusUnidadId ? unidadOrder.indexOf(focusUnidadId) : -1;

  const volverAUnidad = () => {
    // Vuelve al foco unidad sin forzar panel/sheet (selección = unidad o limpia camp)
    if (focusNodeMeta) onSelect(focusNodeMeta);
  };
  /** Carrusel: cambia foco. Móvil no abre sheet (solo campamentos). */
  const goUnidad = (dir: -1 | 1) => {
    if (unidadOrder.length === 0) return;
    const i =
      focusIdx < 0
        ? 0
        : (focusIdx + dir + unidadOrder.length) % unidadOrder.length;
    const id = unidadOrder[i];
    setFocusUnidadId(id);
    const node = byId.get(id);
    // Selecciona unidad p/ highlight + panel desktop; sheet móvil ignora unidades
    if (node) onSelect(node);
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

  /** 0→1 durante explosión; escalonado lento por anillo (unidades → camps). */
  const expandReveal = (ring: number): number => {
    const anim = expandAnimRef.current;
    if (!anim) return 1;
    if (reducedRef.current) return 1;
    const elapsed = performance.now() - anim.start;
    const delay = ring <= 0 ? 0 : ring === 1 ? 220 : 720;
    const span = ring <= 1 ? 1600 : 2200;
    return easeInOutCubic((elapsed - delay) / span);
  };

  /** Opacidad por rim: apex 1, flancos ~0.55, resto 0 (abanico navegable). */
  const nodeOpacity = (n: SebinBrainNode): number => {
    const reveal = expandReveal(n.ring);
    if (!focusUnidadId) {
      if (!focusNode || focusNode.kind === "sebin") return reveal;
      if (n.id === focusNode.id || n.kind === "sebin") return reveal;
      if (focusNode.kind === "unidad") {
        return (
          (n.unidadClave === focusNode.unidadClave || n.id === focusNode.id
            ? 1
            : 0.18) * reveal
        );
      }
      return (
        (n.id === `unidad:${focusNode.unidadClave}` ? 1 : 0.18) * reveal
      );
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
    if (abs < APEX_EPS) {
      if (
        selectedCampId &&
        n.kind === "campamento" &&
        n.id !== selectedCampId
      ) {
        return 0.28;
      }
      return 1;
    }
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
    const selKind = byId.get(selectedId)?.kind;
    if (selKind === "campamento" || selKind === "operador") {
      const campId =
        selKind === "operador" ? (selectedCampId ?? selectedId) : selectedId;
      const lid = limbIdForCamp(campId);
      return (
        branchTarget === campId ||
        branchTarget === lid ||
        (branchSource === SEBIN_BRAIN_CORE_ID &&
          branchTarget === focusUnidadId) ||
        (branchSource === focusUnidadId && branchTarget === lid) ||
        (branchSource === lid && branchTarget === campId)
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

      {/* Migas: fila bajo lista/búsqueda (no compite con KPI ni zoom) */}
      {!ocultarChromeFlotante && (
      <div
        className="pointer-events-none absolute z-20 flex max-w-[min(100%,calc(100%-9rem))] flex-wrap items-center gap-2 pl-14 pr-3 md:max-w-[min(36rem,calc(100%-var(--sebin-chrome-right, 0.75rem)-6rem))]"
        style={{ top: "var(--sebin-chrome-top, 0.75rem)" }}
      >
        {focusUnidadId && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={clearFocus}>
              <ArrowLeft className="size-3.5" />
              Volver
            </Button>
            <span
              className={cn(
                "inline-flex max-w-[11rem] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold backdrop-blur",
                selectedCampMeta && "cursor-pointer hover:bg-muted/40",
              )}
              style={{
                borderColor: focusNodeMeta?.color,
                color: focusNodeMeta?.color,
                background:
                  "color-mix(in oklab, var(--background) 85%, transparent)",
              }}
              title={focusNodeMeta?.label ?? "Unidad"}
              onClick={selectedCampMeta ? volverAUnidad : undefined}
              onKeyDown={
                selectedCampMeta
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        volverAUnidad();
                      }
                    }
                  : undefined
              }
              role={selectedCampMeta ? "button" : undefined}
              tabIndex={selectedCampMeta ? 0 : undefined}
            >
              <span className="truncate">{focusNodeMeta?.label ?? "Unidad"}</span>
              {!selectedCampMeta && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-5 shrink-0"
                  aria-label="Cerrar foco"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFocus();
                  }}
                >
                  <X className="size-3" />
                </Button>
              )}
            </span>
            {selectedCampMeta && (
              <>
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span
                  className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold backdrop-blur"
                  style={{
                    borderColor: META_SEVERIDAD_BRAIN[selectedCampMeta.severidad].color,
                    color: META_SEVERIDAD_BRAIN[selectedCampMeta.severidad].color,
                    background:
                      "color-mix(in oklab, var(--background) 85%, transparent)",
                  }}
                  title={selectedCampMeta.label}
                >
                  <span className="truncate">{selectedCampMeta.label}</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="size-5 shrink-0"
                    aria-label="Volver a la unidad"
                    onClick={volverAUnidad}
                  >
                    <X className="size-3" />
                  </Button>
                </span>
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* flechas: izq / der al borde */}
      {focusUnidadId && !ocultarChromeFlotante && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Unidad anterior"
            onClick={() => goUnidad(-1)}
            className="absolute left-2 top-1/2 z-30 size-10 -translate-y-1/2 rounded-full border-2 border-border bg-background/90 text-foreground shadow-lg hover:bg-accent md:left-4 md:size-14"
          >
            <ArrowLeft className="size-5 md:size-7" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Unidad siguiente"
            onClick={() => goUnidad(1)}
            className="absolute right-2 top-1/2 z-[45] size-10 -translate-y-1/2 rounded-full border-2 border-border bg-background/90 text-foreground shadow-lg hover:bg-accent md:right-4 md:size-14"
          >
            <ArrowRight className="size-5 md:size-7" />
          </Button>
        </>
      )}

      {/* Zoom: esquina superior derecha fija */}
      {!ocultarChromeFlotante && (
      <div className="absolute right-3 top-3 z-50 flex items-center gap-1 rounded-md border bg-background/85 p-1 backdrop-blur">
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
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="sebin-brain-graph relative z-[1] block h-full w-full cursor-grab select-none touch-none active:cursor-grabbing"
        role="img"
        aria-label="Grafo operativo SEBIN. Arrastrar = pan, pellizcar = zoom."
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (focusUnidadId) {
            clearFocus();
            return;
          }
          onSelect(null);
        }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
        onPointerCancel={onBgPointerUp}
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
          @keyframes sebin-crit-ring-pulse {
            from {
              opacity: 0.5;
              stroke-width: 2;
            }
            to {
              opacity: 1;
              stroke-width: 3.4;
            }
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
          .sebin-crit-ring {
            animation: sebin-crit-ring-pulse 1.5s ease-in-out infinite alternate;
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
            .sebin-core-glow, .sebin-crit-halo, .sebin-crit-ring, .sebin-ray,
            .sebin-dash, .sebin-grow { animation: none; }
            .sebin-crit-ring { opacity: 0.9; stroke-width: 2.6; }
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
          // Glow: compacto en núcleo; se abre con la explosión
          const glowTarget =
            (focusUnidadId ? ORBIT_R[3] : SCALE * 0.95) * gk;
          const glowT = redExpandida ? expandReveal(1) : 0;
          const glowR = !redExpandida
            ? 120
            : 120 + (glowTarget - 120) * glowT;
          return (
            <g aria-hidden>
              {/* glow central — home o aparato bajo en foco */}
              <circle
                cx={gc.x}
                cy={gc.y}
                r={glowR}
                fill="url(#sebinCoreGlow)"
                opacity={
                  !redExpandida
                    ? 0.7
                    : (focusUnidadId ? 0.35 : 0.55) *
                      (0.55 + 0.45 * glowT)
                }
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
              {/* Anillos orbitales: aparecen con la explosión */}
              {redExpandida && (
                <g opacity={0.2 + 0.8 * expandReveal(1)} style={glide}>
                  <circle
                    cx={gc.x}
                    cy={gc.y}
                    r={((ORBIT_R[1] + ORBIT_R[2]) / 2) * gk}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="1"
                    opacity={0.28}
                  />
                  <circle
                    cx={gc.x}
                    cy={gc.y}
                    r={((ORBIT_R[2] + ORBIT_R[3]) / 2) * gk}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="1"
                    opacity={0.2}
                  />
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
                      />
                    ))}
                  </g>
                </g>
              )}
              {/* Cerebro solo: anillo suave respirando */}
              {!redExpandida && (
                <circle
                  cx={CX}
                  cy={CY}
                  r={100}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={1.2}
                  opacity={0.45}
                  className="sebin-core-glow"
                  style={{ ...glide, opacity: undefined }}
                />
              )}
            </g>
          );
        })()}

        {/* red radial: oculta en núcleo-solo y en foco */}
        {redExpandida && !focusUnidadId && (
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
              const ring = target?.ring ?? (l.kind === "supervisa" ? 1 : 2);
              const reveal = expandReveal(ring);
              if (reveal < 0.02) return null;
              const baseOp = active
                ? critica
                  ? 0.75
                  : l.kind === "supervisa"
                    ? 0.45
                    : 0.32
                : 0.04;
              const growing = reveal < 0.98;
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
                  opacity={baseOp * reveal}
                  className={
                    growing
                      ? "sebin-grow"
                      : l.kind === "supervisa" && active
                        ? "sebin-ray"
                        : undefined
                  }
                  style={{ transition: growing ? undefined : "opacity 0.35s ease" }}
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

        {redExpandida && !focusUnidadId && (
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
              // Vista inicial: solo el cerebro SEBIN
              if (!redExpandida && n.kind !== "sebin") return null;
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
              const coreR = (() => {
                if (!redExpandida) return CORE_R_SOLO;
                const anim = expandAnimRef.current;
                if (!anim || reducedRef.current) return CORE_R_RED;
                const t = easeOutCubic(
                  (performance.now() - anim.start) / 900,
                );
                return CORE_R_SOLO + (CORE_R_RED - CORE_R_SOLO) * t;
              })();
              const r =
                n.kind === "sebin"
                  ? coreR
                  : n.kind === "unidad" && isFocusHub
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
              // apex: siempre label (corto si denso); home radial: solo hover/sel
              const showCampLabel =
                n.kind === "campamento" &&
                (inApexCamp || isHover || isSel);
              const denseFan = !!focusLayout?.dense || !focusLayout?.labelsReadable;
              const apexCampIdx =
                inApexCamp && focusUnidadId
                  ? (campsOf.get(focusUnidadId) ?? []).findIndex(
                      (c) => c.id === n.id,
                    )
                  : -1;
              const campName =
                n.kind === "campamento"
                  ? campFanLabel(n, {
                      dense: denseFan && inApexCamp && !isHover && !isSel,
                      emphasize: isHover || isSel,
                    })
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
                  onPointerCancel={(e) => onNodePointerUp(e, n.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNodeClick(n);
                  }}
                >
                  {/* Camp: halo suave. Unidad con críticas: solo aro rojo (núcleo intacto). */}
                  {n.kind === "campamento" &&
                    n.severidad === "critica" &&
                    !fade && (
                      <circle
                        r={r + 14}
                        fill="url(#critHalo)"
                        className="sebin-crit-halo"
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                  {n.kind === "unidad" && n.criticos > 0 && (
                    <circle
                      r={r + 5.5}
                      fill="none"
                      stroke={META_SEVERIDAD_BRAIN.critica.color}
                      strokeWidth={2.4}
                      className="sebin-crit-ring"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {(isSel || isHover) && (
                    <circle
                      r={(n.kind === "sebin" ? r + 10 : r) + 5}
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
                      <circle r={r + 14} fill="transparent" />
                      <SebinNeuralCore
                        radius={r}
                        color={sevColor}
                        label="SEBIN"
                      />
                      {!redExpandida && (
                        <text
                          y={r + 36}
                          textAnchor="middle"
                          className="fill-muted-foreground"
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            pointerEvents: "none",
                          }}
                        >
                          Toca para expandir
                        </text>
                      )}
                    </>
                  ) : (
                    <circle
                      r={r}
                      fill={fill}
                      stroke="var(--background)"
                      strokeWidth={isFocusHub ? 2 : 1.4}
                      filter={
                        isFocusHub ||
                        (n.kind !== "unidad" && n.severidad === "critica")
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
                      y={
                        r +
                        11 +
                        (inApexCamp && denseFan && apexCampIdx >= 0
                          ? (apexCampIdx % 2) * 9
                          : 0)
                      }
                      textAnchor="middle"
                      style={{
                        fontSize:
                          isHover || isSel
                            ? 8.5
                            : inApexCamp && denseFan
                              ? 6.5
                              : 8,
                        fontWeight: isHover || isSel ? 700 : 600,
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fill: "var(--foreground)",
                        opacity: isHover || isSel ? 1 : 0.88,
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

        {opsLayout && opsBundle.nodes.length > 0 && (
          <g className="sebin-ops-overlay">
            {opsLayout.branches.map((b) => {
              const s = opsLayout.positions.get(b.source);
              const t = opsLayout.positions.get(b.target);
              if (!s || !t) return null;
              const lit = selectedId === b.target;
              const col =
                byId.get(b.target)?.color ?? "var(--muted-foreground)";
              return (
                <path
                  key={`op-e-${b.target}`}
                  d={branchPath(s, t)}
                  fill="none"
                  stroke={col}
                  strokeWidth={lit ? 1.6 : 1.05}
                  strokeLinecap="round"
                  opacity={lit ? 0.9 : 0.45}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}
            {opsBundle.nodes.map((n) => {
              const p = opsLayout.positions.get(n.id);
              if (!p) return null;
              const r = R_NODE.operador;
              const isSel = selectedId === n.id;
              const isHover = hoverId === n.id;
              const showLabel = isSel || isHover || !opsLayout.dense;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoverId(n.id)}
                  onMouseLeave={() =>
                    setHoverId((h) => (h === n.id ? null : h))
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(n);
                  }}
                >
                  <circle r={9} fill="transparent" />
                  {(isSel || isHover) && (
                    <circle
                      r={r + 5}
                      fill="none"
                      stroke="var(--foreground)"
                      strokeWidth="1.4"
                      opacity="0.85"
                    />
                  )}
                  <circle
                    r={r}
                    fill={n.color}
                    stroke="var(--background)"
                    strokeWidth={1.2}
                    filter={
                      n.reportoHoy ? "url(#brainSoftGlow)" : undefined
                    }
                  />
                  {showLabel && (
                    <text
                      y={r + 10}
                      textAnchor="middle"
                      style={{
                        fontSize: isHover || isSel ? 7.5 : 6.5,
                        fontWeight: isHover || isSel ? 700 : 600,
                        fill: "var(--foreground)",
                        pointerEvents: "none",
                      }}
                    >
                      {opFanLabel(n, isHover || isSel)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}

const LEYENDA_FILTRO: {
  severidad: SeveridadBrain;
  filtro: FiltroReporteBrain;
}[] = [
  { severidad: "ok", filtro: "completo" },
  { severidad: "parcial", filtro: "parcial" },
  { severidad: "pendiente", filtro: "incompleto" },
  { severidad: "critica", filtro: "critica" },
];

/** Cinta de estados → botones toggle (OR). Vacío = todos. */
export function LeyendaSeveridadBrain({
  className,
  filtros,
  onAlternar,
}: {
  className?: string;
  filtros: ReadonlySet<FiltroReporteBrain>;
  onAlternar: (f: FiltroReporteBrain) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrar por estado de reporte"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {LEYENDA_FILTRO.map(({ severidad, filtro }) => {
        const meta = META_SEVERIDAD_BRAIN[severidad];
        const activo = filtros.has(filtro);
        return (
          <Button
            key={filtro}
            type="button"
            size="sm"
            variant={activo ? "secondary" : "outline"}
            aria-pressed={activo}
            aria-label={`Filtrar: ${meta.label}`}
            onClick={() => onAlternar(filtro)}
            className={cn(
              "h-8 gap-1.5 border px-2.5 text-xs shadow-none",
              activo
                ? "font-medium"
                : "bg-background/80 text-muted-foreground hover:text-foreground",
            )}
            style={
              activo
                ? {
                    color: meta.color,
                    background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
                    borderColor: `color-mix(in oklab, ${meta.color} 55%, transparent)`,
                  }
                : undefined
            }
          >
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ background: meta.color }}
              aria-hidden
            />
            {meta.label}
          </Button>
        );
      })}
    </div>
  );
}

export type NovedadesBrainResumen = {
  total: number;
  negativas: number;
  titulos: string[];
};

export function DetalleNodoBrain({
  node,
  dia,
  novedades,
  operadores,
  onElegirOperador,
}: {
  node: SebinBrainNode;
  dia: string;
  novedades?: NovedadesBrainResumen | null;
  operadores?: OperadorBrain[];
  onElegirOperador?: (op: OperadorBrain) => void;
}) {
  if (node.kind === "operador") {
    const ok = Boolean(node.reportoHoy);
    const col = ok
      ? META_SEVERIDAD_BRAIN.ok.color
      : META_SEVERIDAD_BRAIN.pendiente.color;
    return (
      <div className="space-y-2.5">
        {node.sublabel && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {node.sublabel}
          </p>
        )}
        <div
          className="rounded-lg border px-2.5 py-2"
          style={{
            borderColor: `color-mix(in oklab, ${col} 45%, var(--border))`,
          }}
        >
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reporte hoy
          </div>
          <div className="mt-0.5 text-sm font-semibold" style={{ color: col }}>
            {ok ? "Reportó" : "Sin reporte"}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{dia}</p>
        </div>
      </div>
    );
  }

  const sev = META_SEVERIDAD_BRAIN[node.severidad];
  const metaReporte = node.estadoReporte
    ? META_ESTADO_REPORTE[node.estadoReporte]
    : null;

  const reporteTitulo = metaReporte
    ? metaReporte.label
    : node.camps > 0
      ? `${node.reportesOk}/${node.camps} completos`
      : "Sin datos";
  const reporteColor =
    metaReporte?.color ??
    (node.camps > 0 && node.reportesOk === node.camps
      ? META_ESTADO_REPORTE.completo.color
      : node.reportesOk > 0
        ? META_ESTADO_REPORTE.parcial.color
        : META_ESTADO_REPORTE.pendiente.color);
  const reporteDetalle = metaReporte
    ? node.fasesOk != null
      ? `Fases ${node.fasesOk}/6 · ${dia}`
      : dia
    : `${node.camps} campamento${node.camps === 1 ? "" : "s"} · ${dia}`;

  const nov = novedades ?? { total: 0, negativas: 0, titulos: [] };
  const novAlerta = nov.negativas > 0;

  return (
    <div className="space-y-2.5">
      {node.sublabel && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {node.sublabel}
        </p>
      )}

      {node.severidad === "critica" && (
        <div
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium"
          style={{ borderColor: sev.color, color: sev.color }}
        >
          <span className="size-1.5 rounded-full" style={{ background: sev.color }} />
          {sev.label}
        </div>
      )}

      {/* Bloque principal: reporte diario */}
      <div
        className="rounded-lg border px-2.5 py-2"
        style={{ borderColor: `color-mix(in oklab, ${reporteColor} 45%, var(--border))` }}
      >
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Reporte diario
        </div>
        <div
          className="mt-0.5 text-sm font-semibold leading-tight"
          style={{ color: reporteColor }}
        >
          {reporteTitulo}
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{reporteDetalle}</p>
      </div>

      {/* Bloque principal: novedades */}
      <div
        className="rounded-lg border px-2.5 py-2"
        style={
          novAlerta
            ? {
                borderColor: `color-mix(in oklab, ${META_SEVERIDAD_BRAIN.critica.color} 45%, var(--border))`,
              }
            : undefined
        }
      >
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Novedades hoy
        </div>
        {novAlerta ? (
          <>
            <div
              className="mt-0.5 text-sm font-semibold"
              style={{ color: META_SEVERIDAD_BRAIN.critica.color }}
            >
              {nov.negativas === 1
                ? "1 negativa"
                : `${nov.negativas} negativas`}
              {nov.total > nov.negativas
                ? ` · ${nov.total} en total`
                : null}
            </div>
            {nov.titulos.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[10px] leading-snug text-muted-foreground">
                {nov.titulos.map((t, i) => (
                  <li key={`${i}-${t}`} className="truncate">
                    · {t}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : nov.total > 0 ? (
          <div className="mt-0.5 text-sm font-semibold text-foreground">
            {nov.total === 1 ? "1 registrada" : `${nov.total} registradas`}
            <span className="font-normal text-muted-foreground">
              {" "}
              · sin negativas
            </span>
          </div>
        ) : (
          <div className="mt-0.5 text-sm font-medium text-muted-foreground">
            Sin novedades
          </div>
        )}
      </div>

      {node.kind === "campamento" && operadores && operadores.length > 0 && (
        <div className="rounded-lg border px-2.5 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Operadores
          </div>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {operadores.length} asignado{operadores.length === 1 ? "" : "s"}
            <span className="font-normal text-muted-foreground">
              {" "}
              · {operadores.filter((o) => o.reportoHoy).length} reportó hoy
            </span>
          </p>
          {onElegirOperador && (
            <div className="mt-1.5 flex max-h-36 flex-col gap-1 overflow-y-auto">
              {operadores.map((op) => (
                <Button
                  key={`${op.userId}:${op.centroId}`}
                  type="button"
                  size="sm"
                  variant={op.reportoHoy ? "secondary" : "outline"}
                  className="h-7 w-full justify-start px-2 text-[11px]"
                  onClick={() => onElegirOperador(op)}
                >
                  <span
                    className="mr-1.5 size-1.5 shrink-0 rounded-full"
                    style={{
                      background: op.reportoHoy
                        ? META_SEVERIDAD_BRAIN.ok.color
                        : META_SEVERIDAD_BRAIN.pendiente.color,
                    }}
                    aria-hidden
                  />
                  <span className="truncate">{op.label || op.username}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
