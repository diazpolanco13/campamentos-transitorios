import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Skeleton de `/brain` mientras carga el chunk. */
export function BrainViewSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 md:p-4">
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        <div className="h-7 w-72 max-w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_280px]">
        <Card className="min-h-[420px] py-0">
          <CardContent className="flex h-full min-h-[420px] items-center justify-center p-0 lg:min-h-[560px]">
            <div className="size-64 animate-pulse rounded-full border border-dashed border-muted-foreground/30 bg-muted/30" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded-md bg-muted/50" />
            <div className="h-9 animate-pulse rounded-md bg-muted/50" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
