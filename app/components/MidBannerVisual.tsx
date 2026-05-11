/**
 * SVG illustration: woman lying down with headset — warm cozy scene.
 * Built purely in SVG so we don't ship a raster asset.
 */
export default function MidBannerVisual({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 520" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="mb-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8DBC9" />
          <stop offset="55%" stopColor="#D6C4A8" />
          <stop offset="100%" stopColor="#9B8870" />
        </linearGradient>
        <linearGradient id="mb-pillow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4ECDF" />
          <stop offset="100%" stopColor="#D9CBB3" />
        </linearGradient>
        <linearGradient id="mb-blanket" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EFE4D4" />
          <stop offset="100%" stopColor="#B8A48A" />
        </linearGradient>
        <linearGradient id="mb-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5DDC6" />
          <stop offset="100%" stopColor="#D2A989" />
        </linearGradient>
        <linearGradient id="mb-device" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FAFAFA" />
          <stop offset="100%" stopColor="#A6A6A2" />
        </linearGradient>
        <radialGradient id="mb-window" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="#FFF7E8" />
          <stop offset="100%" stopColor="#E2D2B2" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Room background */}
      <rect width="1200" height="520" fill="url(#mb-room)" />

      {/* Window light wash on left */}
      <rect x="0" y="0" width="500" height="520" fill="url(#mb-window)" />
      <g opacity="0.18">
        <rect x="40" y="30" width="220" height="320" fill="#FFFFFF" />
        <line x1="150" y1="30" x2="150" y2="350" stroke="#9B8870" strokeWidth="6" />
        <line x1="40" y1="180" x2="260" y2="180" stroke="#9B8870" strokeWidth="6" />
      </g>

      {/* Leaves top-right */}
      <g opacity="0.5">
        <path d="M1050 30 C 1100 70, 1110 140, 1080 200 C 1060 160, 1050 100, 1050 30Z" fill="#6B7A45" />
        <path d="M1100 90 C 1150 130, 1160 200, 1130 260 C 1110 220, 1100 160, 1100 90Z" fill="#7E8E54" />
      </g>

      {/* Pillow */}
      <path d="M700 300 C 700 240, 800 220, 900 230 C 1020 240, 1100 260, 1120 320 C 1120 360, 1020 380, 920 380 C 820 380, 700 360, 700 300Z" fill="url(#mb-pillow)" />

      {/* Blanket */}
      <path d="M200 460 C 280 380, 480 360, 620 400 C 780 440, 900 460, 1200 440 L 1200 520 L 0 520 L 0 480 Z" fill="url(#mb-blanket)" />

      {/* Body / chest */}
      <path d="M450 460 C 520 380, 660 360, 800 380 C 900 395, 970 420, 1000 460 Z" fill="#F2E6D2" />

      {/* Head */}
      <ellipse cx="860" cy="290" rx="92" ry="80" fill="url(#mb-skin)" />

      {/* Hair behind */}
      <path d="M760 260 C 770 200, 830 180, 880 195 C 950 210, 970 270, 950 300 L 770 300 Z" fill="#221915" />

      {/* Device band over head */}
      <path d="M770 220 C 780 200, 820 188, 860 188 C 900 188, 940 200, 950 220 L 950 240 L 770 240 Z" fill="url(#mb-device)" />
      <rect x="775" y="232" width="170" height="14" rx="6" fill="#FF7A45" opacity="0.85" />
      <rect x="775" y="232" width="170" height="14" rx="6" fill="#FFB686" opacity="0.5" />

      {/* Closed eye hint */}
      <path d="M820 290 Q 835 296 850 290" stroke="#5A3A28" strokeWidth="1.6" fill="none" />

      {/* Tea cup bottom right */}
      <g>
        <ellipse cx="1090" cy="470" rx="42" ry="10" fill="#000" opacity="0.08" />
        <path d="M1054 430 C 1054 420, 1126 420, 1126 430 L 1120 462 C 1118 472, 1062 472, 1060 462 Z" fill="#F3E6CF" />
        <path d="M1126 432 C 1144 432, 1148 458, 1126 460" stroke="#C9A47A" strokeWidth="3" fill="none" />
        <ellipse cx="1090" cy="432" rx="34" ry="6" fill="#C9A47A" />
      </g>
    </svg>
  );
}
