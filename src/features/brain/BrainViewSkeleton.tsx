/** Skeleton de `/brain` mientras carga el chunk. */
export function BrainViewSkeleton() {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-background">
      <div className="sebin-space-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="absolute inset-x-3 top-3 z-10 rounded-xl border border-border/70 bg-background/80 p-3 backdrop-blur-md">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
          <div className="space-y-1.5">
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="h-5 w-56 max-w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:max-w-xl">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg border bg-muted/40" />
            ))}
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-28 animate-pulse rounded-md bg-muted/50" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted/50" />
          </div>
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="size-64 animate-pulse rounded-full border border-dashed border-muted-foreground/30 bg-muted/30" />
      </div>
      <aside className="absolute bottom-3 right-3 top-3 z-10 flex w-[14.5rem] flex-col overflow-hidden rounded-xl border border-border/70 bg-background/85 backdrop-blur-md">
        <div className="border-b border-border/60 px-2.5 py-1.5">
          <div className="h-3.5 w-14 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2 p-2.5">
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="h-12 animate-pulse rounded-md bg-muted/50" />
          <div className="h-8 animate-pulse rounded-md bg-muted/50" />
        </div>
      </aside>
    </div>
  );
}
