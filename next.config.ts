import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // AVIF preserves PNG alpha and gives much better quality-per-byte than
    // the default webp at the same setting. Falls back to webp automatically.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
