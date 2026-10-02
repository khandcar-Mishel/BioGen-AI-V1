/**
 * The BioGen AI logo (public/main.jpeg). One component so every place that shows the mark - navigation, footer,
 * studio sidebar, sign-in, favicon - stays identical. The artwork sits on pure black, so the tile is black too and the
 * rounded corners just trim the square.
 */
export function BrandMark({ size = 38, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`brand-mark inline-flex shrink-0 items-center justify-center overflow-hidden bg-black ${className}`}
      style={{ height: size, width: size, borderRadius: Math.round(size * 0.26) }}
      aria-hidden="true"
    >
      <img src="/main.jpeg" alt="" width={size} height={size} draggable={false} className="h-full w-full object-contain" />
    </span>
  );
}
