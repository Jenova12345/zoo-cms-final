// Čistá značková dlaždice: kapka se dvěma očima obojživelníka.
// Profesionální app-icon styl, plná značková zelená.
export function LogoMark({ size = 36 }: { size?: number; glow?: boolean }) {
  return (
    <span
      className="inline-grid place-items-center rounded-xl bg-accent shadow-sm"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        {/* kapka */}
        <path
          d="M16 3c4.6 5.4 8.5 9.7 8.5 14.4A8.5 8.5 0 0 1 7.5 17.4C7.5 12.7 11.4 8.4 16 3Z"
          fill="rgba(255,255,255,0.16)"
          stroke="#FFFFFF"
          strokeWidth="1.8"
        />
        {/* oči */}
        <circle cx="13" cy="18" r="2.1" fill="#FFFFFF" />
        <circle cx="19" cy="18" r="2.1" fill="#FFFFFF" />
        <circle cx="13" cy="18" r="0.85" fill="#0F766E" />
        <circle cx="19" cy="18" r="0.85" fill="#0F766E" />
      </svg>
    </span>
  );
}

export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="leading-tight">
      <div className="font-display text-sm font-bold tracking-tight text-fg">Amphibiárium</div>
      {subtitle && <div className="text-[11px] font-medium text-fg-dim">{subtitle}</div>}
    </div>
  );
}
