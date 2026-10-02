/** The same molecular monogram appears in the navigation, workspace and favicon. */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <span
      className="brand-mark inline-flex shrink-0 items-center justify-center"
      style={{ height: size, width: size, background: '#0B2B33', borderRadius: Math.round(size * 0.26) }}
      aria-hidden="true"
    >
      <svg width={size * .7} height={size * .7} viewBox="0 0 32 32" fill="none">
        <path d="m16 4 10.4 6v12L16 28 5.6 22V10L16 4Z" stroke="#a7e9cc" strokeWidth="1.6" />
        <path d="m16 4 0 12m10.4-6L16 16 5.6 10M16 16v12m0-12 10.4 6M16 16 5.6 22" stroke="#a7e9cc" strokeWidth="1.3" opacity=".6" />
        <circle cx="16" cy="16" r="3.5" fill="#c3efaa" /><circle cx="16" cy="4" r="2.4" fill="#a7e9cc" /><circle cx="5.6" cy="22" r="2.4" fill="#a7e9cc" /><circle cx="26.4" cy="22" r="2.4" fill="#a7e9cc" />
      </svg>
    </span>
  );
}
