type StatCardProps = {
  label: string;
  value: string;
  suffix?: string;
  caption?: string;
  icon?: React.ReactNode;
  className?: string;
};

export default function StatCard({
  label,
  value,
  suffix,
  caption,
  icon,
  className = "",
}: StatCardProps) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.18)] px-5 py-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-[var(--muted)] tracking-wide">{label}</p>
          <p className="mt-3 flex items-baseline gap-1 text-[28px] leading-none font-medium text-[var(--foreground)]">
            {value}
            {suffix ? <span className="text-[28px] leading-none">{suffix}</span> : null}
            {caption ? (
              <span className="ml-2 text-[11px] text-[var(--muted)] font-normal tracking-wide">
                {caption}
              </span>
            ) : null}
          </p>
        </div>
        {icon ? (
          <div className="shrink-0 h-10 w-10 rounded-full bg-[var(--dark)] flex items-center justify-center">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
