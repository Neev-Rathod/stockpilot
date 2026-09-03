// Subtle animated backdrop for the landing + auth screens: a slow-drifting
// gold aurora over a faded grid. Pure CSS (see globals.css), no perf cost,
// and it disables itself under prefers-reduced-motion. Lives inside a
// `relative overflow-hidden` parent; content should sit at z-10 above it.
export function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="ambient-grid" />
      <div className="ambient-aurora ambient-aurora-1" />
      <div className="ambient-aurora ambient-aurora-2" />
    </div>
  );
}
