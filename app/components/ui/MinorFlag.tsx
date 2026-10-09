import { Badge } from "./Feedback";
import { IconShield } from "./icons";

/**
 * "Under 18 · safeguarding" — the one spelling of the flag a provider sees on
 * a young person's chat, session and summary.
 *
 * One component is the whole point: a flag implemented three times is a flag
 * that is missing from one of them.
 */
export default function MinorFlag({
  size = "badge",
  className = "",
}: {
  /** "row" is the compact form for a list line. */
  size?: "badge" | "row";
  className?: string;
}) {
  if (size === "row") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[var(--accent)] ${className}`}
        title="Under 18 — a parent or guardian's consent is needed before treatment"
      >
        <IconShield size={12} />
        Under 18
      </span>
    );
  }
  return (
    <Badge tone="accent" className={`gap-1.5 ${className}`}>
      <IconShield size={12} />
      Under 18 · safeguarding
    </Badge>
  );
}
