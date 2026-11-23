/** Shown while a lazily loaded page's code downloads. Kept tiny: it is in the main bundle. */
export function RouteFallback() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
