/**
 * The few glyphs the content editor needs that the kit's icon set does not
 * have, drawn the same way: 24×24, round caps, currentColor.
 */

type GlyphProps = { size?: number; className?: string };

function Glyph({ size = 16, className = "", children }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const GlyphPlus = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);

export const GlyphArrowUp = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Glyph>
);

export const GlyphArrowDown = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Glyph>
);

/** Six dots: "hold here to drag". */
export const GlyphGrip = (p: GlyphProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" className={p.className} aria-hidden>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);

export const GlyphExternal = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Glyph>
);

export const GlyphCopy = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Glyph>
);

export const GlyphUndo = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Glyph>
);

export const GlyphChevron = ({ open = false, ...p }: GlyphProps & { open?: boolean }) => (
  <Glyph {...p} className={`${p.className ?? ""} transition-transform ${open ? "rotate-180" : ""}`}>
    <path d="M6 9l6 6 6-6" />
  </Glyph>
);

export const GlyphBold = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </Glyph>
);

export const GlyphItalic = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M14 5h5M5 19h5M15 5l-6 14" />
  </Glyph>
);

export const GlyphLink = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </Glyph>
);

export const GlyphBullets = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <circle cx="5" cy="6" r="1" />
    <circle cx="5" cy="12" r="1" />
    <circle cx="5" cy="18" r="1" />
  </Glyph>
);

export const GlyphNumbers = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 5l1.5-1v5M3.8 13.2a1.4 1.4 0 0 1 2.4 1L4 17h2.4" />
  </Glyph>
);

export const GlyphHeading = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M6 5v14M16 5v14M6 12h10" />
    <path d="M19 19v-5l-1.5 1" />
  </Glyph>
);

/** Curly braces: the placeholders. */
export const GlyphBraces = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M8 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h1" />
    <path d="M16 4h1a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-1" />
  </Glyph>
);
