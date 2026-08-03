import { useMemo, useRef, useEffect } from "react";

/** Pseudo-aleatorio estable. */
function hash01(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

type Neuron = { x: number; y: number; r: number; hub: boolean };
type Synapse = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  op: number;
};

/**
 * Núcleo SEBIN circular: red neuronal interna animada + corriente en el aro.
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
  const fieldRef = useRef<SVGGElement | null>(null);
  const pulseRefs = useRef<(SVGCircleElement | null)[]>([]);
  const currentRefs = useRef<(SVGCircleElement | null)[]>([]);
  const dashRef = useRef<SVGCircleElement | null>(null);

  const field = useMemo(() => {
    const neurons: Neuron[] = [];
    const rMax = radius - 10;
    const target = Math.max(32, Math.round(radius * 0.8));
    let i = 0;
    let guard = 0;
    while (neurons.length < target && guard < target * 50) {
      guard += 1;
      const u = hash01(i, 1);
      const v = hash01(i, 2);
      // disco con más densidad hacia el borde (corteza)
      const ang = u * Math.PI * 2;
      const rad = Math.sqrt(0.15 + 0.85 * v) * rMax;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      i += 1;
      // reserva hueco central p/ label
      if (Math.hypot(x, y) < radius * 0.22) continue;
      const hub = neurons.length < 8 || hash01(i, 3) > 0.9;
      neurons.push({
        x,
        y,
        r: hub ? 1.7 + hash01(i, 4) * 0.8 : 0.85 + hash01(i, 4) * 0.65,
        hub,
      });
    }

    const synapses: Synapse[] = [];
    const k = 3;
    for (let a = 0; a < neurons.length; a++) {
      const na = neurons[a];
      const dist: { b: number; d: number }[] = [];
      for (let b = 0; b < neurons.length; b++) {
        if (a === b) continue;
        const nb = neurons[b];
        const dx = na.x - nb.x;
        const dy = na.y - nb.y;
        dist.push({ b, d: dx * dx + dy * dy });
      }
      dist.sort((p, q) => p.d - q.d);
      for (let j = 0; j < k && j < dist.length; j++) {
        const b = dist[j].b;
        if (a > b) continue;
        const nb = neurons[b];
        synapses.push({
          x1: na.x,
          y1: na.y,
          x2: nb.x,
          y2: nb.y,
          w: na.hub || nb.hub ? 0.5 : 0.28,
          op: na.hub || nb.hub ? 0.4 : 0.18,
        });
      }
    }

    const pulseEdges = synapses
      .map((_, idx) => idx)
      .filter((idx) => hash01(idx, 11) > 0.7)
      .slice(0, 10);

    return { neurons, synapses, pulseEdges };
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
        // giro lento del campo neuronal
        ang = (ang + dt * 6) % 360;
        fieldRef.current?.setAttribute(
          "transform",
          `rotate(${ang.toFixed(3)})`,
        );

        // pulsos por sinapsis
        const edges = field.synapses;
        const idxs = field.pulseEdges;
        for (let p = 0; p < idxs.length; p++) {
          const el = pulseRefs.current[p];
          const syn = edges[idxs[p]];
          if (!el || !syn) continue;
          const phase = (t * (0.4 + (p % 4) * 0.11) + p * 0.31) % 1;
          const x = syn.x1 + (syn.x2 - syn.x1) * phase;
          const y = syn.y1 + (syn.y2 - syn.y1) * phase;
          const fade = Math.sin(phase * Math.PI);
          el.setAttribute("cx", x.toFixed(2));
          el.setAttribute("cy", y.toFixed(2));
          el.setAttribute("opacity", (0.2 + 0.8 * fade).toFixed(3));
          el.setAttribute("r", (1.2 + 1.1 * fade).toFixed(2));
        }

        // corriente en el aro (varios paquetes)
        const ringR = radius + 4;
        const nCur = currentRefs.current.length;
        for (let c = 0; c < nCur; c++) {
          const el = currentRefs.current[c];
          if (!el) continue;
          const speed = 0.55 + c * 0.12;
          const a = (t * speed + (c / nCur) * Math.PI * 2) % (Math.PI * 2);
          el.setAttribute("cx", (Math.cos(a) * ringR).toFixed(2));
          el.setAttribute("cy", (Math.sin(a) * ringR).toFixed(2));
          el.setAttribute("opacity", (0.55 + 0.35 * Math.sin(t * 4 + c)).toFixed(3));
        }

        // dash del aro que “corre”
        if (dashRef.current) {
          const circ = 2 * Math.PI * (radius + 4);
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
      {/* Disco base */}
      <circle
        r={radius + 8}
        fill="var(--card)"
        fillOpacity={0.85}
        stroke="var(--border)"
        strokeWidth={1}
      />
      <circle r={radius - 1} fill={color} className="sebin-core-glow" />
      <circle
        r={radius - 1}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.35}
      />

      {/* Aro externo + corriente */}
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

      {/* Red interna */}
      <g ref={fieldRef}>
        {field.synapses.map((e, i) => (
          <line
            key={`s-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={color}
            strokeWidth={e.w}
            opacity={e.op}
            strokeLinecap="round"
          />
        ))}
        {field.neurons.map((n, i) => (
          <circle
            key={`n-${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={color}
            fillOpacity={n.hub ? 0.95 : 0.55 + hash01(i, 12) * 0.35}
            stroke={n.hub ? "var(--foreground)" : undefined}
            strokeOpacity={n.hub ? 0.2 : undefined}
            strokeWidth={n.hub ? 0.35 : undefined}
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

      <circle
        r={Math.max(14, radius * 0.26)}
        fill="var(--card)"
        fillOpacity={0.62}
      />
      <text
        y={fontSize * 0.35}
        textAnchor="middle"
        className="fill-foreground"
        style={{
          fontSize,
          fontWeight: 700,
          letterSpacing: "0.12em",
          pointerEvents: "none",
        }}
      >
        {label}
      </text>
    </g>
  );
}
