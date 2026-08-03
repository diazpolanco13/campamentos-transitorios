/**
 * Coalesce rapid calls: wrapped fn runs at most once per animation frame.
 * d3 force ticks freely; React paint stays frame-rate.
 */
export function rafThrottle(fn: () => void): () => void {
  let scheduled = false;
  const schedule: (cb: () => void) => unknown =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      fn();
    });
  };
}
