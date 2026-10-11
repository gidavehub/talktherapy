import Image from "next/image";

/**
 * The TALK mark — the sage arch for the A, the terracotta dot inside it, and
 * LISTEN • SUPPORT • HEAL • GROW beneath. `light` is the version for dark
 * backgrounds (cream letters).
 */
export default function Logo({
  height = 40,
  light = false,
  className = "",
  priority = false,
}: {
  height?: number;
  light?: boolean;
  className?: string;
  priority?: boolean;
}) {
  // The cut-out is 507×211.
  const width = Math.round((height * 507) / 211);
  return (
    <Image
      src={light ? "/brand/logo-light.png" : "/brand/logo.png"}
      alt="TALK — listen, support, heal, grow"
      width={width}
      height={height}
      priority={priority}
      className={`select-none ${className}`}
      style={{ width, height }}
    />
  );
}
