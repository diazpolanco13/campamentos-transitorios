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
 * Núcleo SEBIN estilo red neuronal / constelación FounderOS (memory core).
 * Puntos + spokes determinísticos; rotación lenta vía rAF.
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
    // edges: hub spokes + neighbor links
    const edges: { x1: number; y1: number; x2: number; y2: number; hub: boolean }[] = [];
    for (const h of hubs) {
      edges.push({ x1: 0, y1: 0, x2: h.x, y2: h.y, hub: true });
    }
    for (let i = 0; i < notes.length; i++) {
      const a = notes[i];
      const b = notes[(i + 3) % notes.length];
      edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, hub: false });
    }
    return { hubs, notes, edges };
  }, [radius]);

  useEffect(() => {
    let raf = 0;
    let ang = 0;
    let last = performance.now();
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) {
        ang = (ang + dt * 8) % 360; // ~45s / vuelta
        rotRef.current?.setAttribute("transform", `rotate(${ang.toFixed(3)})`);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      </g>
      <text
        y={4}
        textAnchor="middle"
        className="fill-foreground"
        style={{
          fontSize: 10,
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
