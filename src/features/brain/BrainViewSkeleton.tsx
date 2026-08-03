/** Skeleton de `/brain` mientras carga el chunk. */
export function BrainViewSkeleton() {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-background">
      <div className="sebin-space-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      {/* Pill izq. */}
      <div
        className="absolute left-3 top-3 z-20 flex flex-col gap-1 overflow-hidden rounded-xl border border-border/60 bg-card/90 p-1 shadow-lg"
        aria-hidden
      >
        <div className="size-8 animate-pulse rounded-md bg-muted/50" />
        <div className="size-8 animate-pulse rounded-md bg-muted/50" />
      </div>
      {/* KPIs flotantes (estilo mapa) */}
      <div
        className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex gap-1.5 md:inset-x-auto md:bottom-auto md:left-14 md:right-14 md:top-3"
        aria-hidden
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-12 min-w-[5.75rem] animate-pulse rounded-xl border border-border/40 bg-muted/40"
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="size-64 animate-pulse rounded-full border border-dashed border-muted-foreground/30 bg-muted/30" />
      </div>
    </div>
  );
}
