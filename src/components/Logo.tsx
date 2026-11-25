export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="36" height="36" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="1" y="1" width="46" height="46" rx="10" fill="#171719" stroke="#D4AF65" strokeWidth="1.2" />
        <path d="M24 9l2.1 5.4h-1.2L24 12.4l-.9 2H21.9L24 9z" fill="#D4AF65" />
        <path d="M16.5 18.5h15v2c0 3.8-2.4 6.6-5.6 7.5V31h2.8v2H19.3v-2h2.8v-3c-3.2-.9-5.6-3.7-5.6-7.5v-2z" fill="none" stroke="#E8CB8A" strokeWidth="1.5" />
        <path d="M19 36.2h10" stroke="#D4AF65" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {compact ? null : (
        <span className="display text-[1.7rem] leading-none text-ivory">
          Royal <span className="text-gold">Chess</span>
        </span>
      )}
    </span>
  );
}
