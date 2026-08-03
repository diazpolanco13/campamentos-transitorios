import { useMemo, useRef, useEffect } from "react";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function hexPts(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * Núcleo SEBIN: red interna estilo constelación (hubs hex + golden spiral)
 * + pulsos que viajan nodo→nodo + corriente en el aro externo.
 */
export function SebinNeuralCore({
  radius = 34,
  color = "#ef4444",
  label = "SEBIN",
}: {
  radius?: number;
  color?: string;
  label?: string;
}) {
  const rotRef = useRef<SVGGElement | null>(null);
  const pulseRefs = useRef<(SVGCircleElement | null)[]>([]);
  const currentRefs = useRef<(SVGCircleElement | null)[]>([]);
  const dashRef = useRef<SVGCircleElement | null>(null);

  const field = useMemo(() => {
    const hubs: { x: number; y: number; r: number }[] = [];
    const notes: { x: number; y: number; r: number }[] = [];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const rad = Math.sqrt((i + 0.5) / n) * (radius - 7);
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i < 7) hubs.push({ x, y, r: 2.4 });
      else notes.push({ x, y, r: 1.35 + (i % 3) * 0.25 });
    }

    type Edge = {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      hub: boolean;
    };
    const edges: Edge[] = [];
    for (const h of hubs) {
      edges.push({ x1: 0, y1: 0, x2: h.x, y2: h.y, hub: true });
    }
    for (let i = 0; i < notes.length; i++) {
      const a = notes[i];
      const b = notes[(i + 3) % notes.length];
      edges.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        hub: false,
      });
    }
    // También enlaza notas a hub cercano (más caminos p/ pulsos)
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      let best = 0;
      let bestD = Infinity;
      for (let h = 0; h < hubs.length; h++) {
        const dx = note.x - hubs[h].x;
        const dy = note.y - hubs[h].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      if (i % 2 === 0) {
        edges.push({
          x1: note.x,
          y1: note.y,
          x2: hubs[best].x,
          y2: hubs[best].y,
          hub: false,
        });
      }
    }

    // Índices de aristas donde viajan pulsos (prioriza spokes + algunos links)
    const pulseEdges = edges
      .map((e, idx) => ({ e, idx }))
      .filter(({ e, idx }) => e.hub || idx % 3 === 0)
      .map(({ idx }) => idx)
      .slice(0, 12);

    return { hubs, notes, edges, pulseEdges };
  }, [radius]);

  useEffect(() => {
    let raf = 0;
    let ang = 0;
    let t = 0;
    let last = performance.now();
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) {
        t += dt;
        ang = (ang + dt * 8) % 360;
        rotRef.current?.setAttribute("transform", `rotate(${ang.toFixed(3)})`);

        // Pulsos nodo → nodo
        const edges = field.edges;
        const idxs = field.pulseEdges;
        for (let p = 0; p < idxs.length; p++) {
          const el = pulseRefs.current[p];
          const syn = edges[idxs[p]];
          if (!el || !syn) continue;
          const phase = (t * (0.45 + (p % 4) * 0.1) + p * 0.29) % 1;
          const x = syn.x1 + (syn.x2 - syn.x1) * phase;
          const y = syn.y1 + (syn.y2 - syn.y1) * phase;
          const fade = Math.sin(phase * Math.PI);
          el.setAttribute("cx", x.toFixed(2));
          el.setAttribute("cy", y.toFixed(2));
          el.setAttribute("opacity", (0.2 + 0.8 * fade).toFixed(3));
          el.setAttribute("r", (1.15 + 1.05 * fade).toFixed(2));
        }

        // Corriente en el aro
        const ringR = radius + 4;
        const nCur = currentRefs.current.length;
        for (let c = 0; c < nCur; c++) {
          const el = currentRefs.current[c];
          if (!el) continue;
          const speed = 0.55 + c * 0.12;
          const a = (t * speed + (c / Math.max(1, nCur)) * Math.PI * 2) %
            (Math.PI * 2);
          el.setAttribute("cx", (Math.cos(a) * ringR).toFixed(2));
          el.setAttribute("cy", (Math.sin(a) * ringR).toFixed(2));
          el.setAttribute(
            "opacity",
            (0.55 + 0.35 * Math.sin(t * 4 + c)).toFixed(3),
          );
        }
        if (dashRef.current) {
          const circ = 2 * Math.PI * ringR;
          dashRef.current.setAttribute(
            "stroke-dashoffset",
            (-(t * 28) % circ).toFixed(2),
          );
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [field, radius]);

  const fontSize = Math.max(9, Math.min(14, radius * 0.14));
  const ringR = radius + 4;
  const ringCirc = 2 * Math.PI * ringR;

  return (
    <g className="sebin-neural-core" style={{ pointerEvents: "none" }}>
      <circle
        r={radius + 8}
        fill="var(--card)"
        fillOpacity={0.85}
        stroke="var(--border)"
        strokeWidth={1}
      />
      <circle r={radius - 2} fill={color} className="sebin-core-glow" />

      {/* Aro + corriente */}
      <circle
        r={ringR}
        fill="none"
        stroke="var(--border)"
        strokeWidth={1.2}
        opacity={0.45}
      />
      <circle
        ref={dashRef}
        r={ringR}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeDasharray={`${Math.max(10, ringCirc * 0.08)} ${Math.max(18, ringCirc * 0.18)}`}
        strokeDashoffset={0}
        opacity={0.75}
      />
      {Array.from({ length: 3 }, (_, c) => (
        <circle
          key={`cur-${c}`}
          ref={(el) => {
            currentRefs.current[c] = el;
          }}
          r={2.2 - c * 0.25}
          fill={color}
          opacity={0}
          filter="url(#brainSoftGlow)"
        />
      ))}

      {/* Red interna (diseño original) */}
      <g ref={rotRef}>
        {field.edges.map((e, i) => (
          <line
            key={`e-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={color}
            strokeWidth={e.hub ? 0.55 : 0.3}
            opacity={e.hub ? 0.45 : 0.18}
          />
        ))}
        {field.hubs.map((h, i) => (
          <polygon
            key={`h-${i}`}
            points={hexPts(h.r)}
            transform={`translate(${h.x},${h.y})`}
            fill={color}
            fillOpacity={0.95}
          />
        ))}
        {field.notes.map((n, i) => (
          <circle
            key={`n-${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={color}
            fillOpacity={0.7 + (i % 5) * 0.05}
          />
        ))}
        {field.pulseEdges.map((_, p) => (
          <circle
            key={`p-${p}`}
            ref={(el) => {
              pulseRefs.current[p] = el;
            }}
            r={1.4}
            fill={color}
            opacity={0}
            filter="url(#brainSoftGlow)"
          />
        ))}
      </g>

      <text
        y={4}
        textAnchor="middle"
        className="fill-foreground"
        style={{
          fontSize,
          fontWeight: 700,
          letterSpacing: "0.1em",
          pointerEvents: "none",
        }}
      >
        {label}
      </text>
    </g>
  );
}
