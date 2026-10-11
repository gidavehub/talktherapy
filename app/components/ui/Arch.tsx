import Image from "next/image";

/**
 * The arch — the redesign's frame for every person: a tall shape rounded at
 * the top, in one of the palette's colours, with somebody standing in it.
 */

/** The arch colours, in the order the mockups use them. */
export const ARCH_TONES = [
  "var(--sage-soft)",
  "var(--peach)",
  "var(--sage)",
  "var(--sage-pale)",
  "var(--accent)",
  "#C9D3BE",
] as const;

export function archTone(index: number): string {
  return ARCH_TONES[((index % ARCH_TONES.length) + ARCH_TONES.length) % ARCH_TONES.length];
}

export function ArchFrame({
  tone = ARCH_TONES[0],
  className = "",
  children,
}: {
  tone?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`arch relative overflow-hidden ${className}`} style={{ background: tone }}>
      {children}
    </div>
  );
}

/**
 * Someone in an arch. A cut-out (transparent) stands at the bottom, a little
 * wider than the arch, so the arch's colour shows above their head; a photo
 * with its own background fills it.
 */
export function ArchPortrait({
  src,
  alt,
  tone,
  className = "",
  sizes = "200px",
  cutout = true,
  scale = 1.18,
  aspect = 1,
  priority = false,
}: {
  src: string;
  alt: string;
  tone?: string;
  className?: string;
  sizes?: string;
  /** A transparent cut-out (stands at the bottom) rather than a full photo. */
  cutout?: boolean;
  /** How wide a cut-out stands, against the arch's width. */
  scale?: number;
  /** The image's height over its width: 1 for a portrait, 4/3 for a scene. */
  aspect?: number;
  priority?: boolean;
}) {
  return (
    <ArchFrame tone={tone} className={className}>
      {cutout ? (
        <Image
          src={src}
          alt={alt}
          width={640}
          height={Math.round(640 * aspect)}
          sizes={sizes}
          priority={priority}
          className="absolute bottom-0 left-1/2 h-auto max-w-none -translate-x-1/2"
          style={{ width: `${scale * 100}%` }}
        />
      ) : (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover object-top" />
      )}
    </ArchFrame>
  );
}
