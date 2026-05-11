/**
 * SVG portrait mimicking the reference: head/shoulders silhouette with a
 * visor-style orange glow band over the eyes and small temple sensors.
 * Pure SVG so no remote asset/config is needed.
 */
export default function HeroVisual({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 720"
      className={className}
      role="img"
      aria-label="Person wearing an AI-guided therapy device"
    >
      <defs>
        <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5DDC6" />
          <stop offset="60%" stopColor="#E6BC9A" />
          <stop offset="100%" stopColor="#C99476" />
        </linearGradient>
        <linearGradient id="device" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FAFAFA" />
          <stop offset="55%" stopColor="#D7D6D2" />
          <stop offset="100%" stopColor="#8A8A86" />
        </linearGradient>
        <linearGradient id="visor" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF7A45" />
          <stop offset="50%" stopColor="#FFB174" />
          <stop offset="100%" stopColor="#FF5A1F" />
        </linearGradient>
        <linearGradient id="turtle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FAFAF8" />
          <stop offset="100%" stopColor="#D7D5CF" />
        </linearGradient>
        <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1B1B1B" />
          <stop offset="100%" stopColor="#0A0A0A" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FFB686" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#FF7A45" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FF5A1F" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft shadow under figure */}
      <ellipse cx="300" cy="700" rx="220" ry="14" fill="#000" opacity="0.05" />

      {/* Turtleneck shoulders */}
      <path
        d="M70 720 C 90 540, 230 470, 300 470 C 370 470, 510 540, 530 720 Z"
        fill="url(#turtle)"
      />

      {/* Neck */}
      <path
        d="M250 430 C 250 470, 252 490, 264 502 L 336 502 C 348 490, 350 470, 350 430 Z"
        fill="url(#skin)"
      />

      {/* Hair back */}
      <path
        d="M150 250 C 150 110, 230 50, 305 50 C 395 50, 470 110, 470 250 L 470 380 C 470 410, 460 430, 440 440 L 160 440 C 140 430, 130 410, 130 380 Z"
        fill="url(#hair)"
      />

      {/* Face */}
      <path
        d="M195 250 C 195 170, 240 120, 305 120 C 370 120, 415 170, 415 260 C 415 340, 385 410, 340 430 C 320 438, 290 438, 270 430 C 225 410, 195 340, 195 260 Z"
        fill="url(#skin)"
      />

      {/* Subtle cheek shading */}
      <ellipse cx="240" cy="320" rx="22" ry="12" fill="#D89A78" opacity="0.45" />
      <ellipse cx="370" cy="320" rx="22" ry="12" fill="#D89A78" opacity="0.45" />

      {/* Nose */}
      <path
        d="M300 270 C 296 300, 290 325, 296 345 C 300 354, 312 354, 316 345 C 322 325, 314 300, 310 270 Z"
        fill="#D8A07E"
        opacity="0.55"
      />

      {/* Lips */}
      <path
        d="M275 380 C 290 372, 320 372, 335 380 C 320 392, 290 392, 275 380 Z"
        fill="#B86A55"
        opacity="0.7"
      />

      {/* Device — front band */}
      <path
        d="M130 200 C 130 170, 160 140, 200 138 L 410 138 C 450 140, 480 170, 480 200 L 480 250 C 480 268, 466 282, 448 282 L 162 282 C 144 282, 130 268, 130 250 Z"
        fill="url(#device)"
      />

      {/* Device — top arch */}
      <path
        d="M150 200 C 160 100, 250 60, 305 60 C 360 60, 450 100, 460 200 L 460 220 L 150 220 Z"
        fill="url(#device)"
      />

      {/* Visor inner — orange glow band */}
      <rect
        x="160"
        y="222"
        width="290"
        height="48"
        rx="22"
        fill="url(#visor)"
      />
      <rect
        x="160"
        y="222"
        width="290"
        height="48"
        rx="22"
        fill="url(#glow)"
        opacity="0.75"
      />

      {/* Visor speckles (LED dots) */}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          cx={235 + i * 35}
          cy={246}
          r="2.4"
          fill="#FFFFFF"
          opacity="0.85"
        />
      ))}

      {/* Temple sensor lights */}
      <circle cx="195" cy="335" r="6" fill="#FF7A45" />
      <circle cx="195" cy="335" r="11" fill="url(#glow)" opacity="0.9" />
      <circle cx="412" cy="335" r="6" fill="#FF7A45" />
      <circle cx="412" cy="335" r="11" fill="url(#glow)" opacity="0.9" />

      {/* Device side line */}
      <rect x="130" y="262" width="18" height="36" rx="6" fill="#9C9994" />
      <rect x="462" y="262" width="18" height="36" rx="6" fill="#9C9994" />
    </svg>
  );
}
