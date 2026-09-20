import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // AVIF preserves PNG alpha and gives much better quality-per-byte than
    // the default webp at the same setting. Falls back to webp automatically.
    formats: ["image/avif", "image/webp"],
    // Next 16 defaults this to [75] and silently coerces anything else to the
    // nearest allowed value. The hero ships at 95 and section art at 92, so
    // both have to be declared here or they get quietly downgraded.
    qualities: [75, 92, 95],
    remotePatterns: [
      // Google account avatars (photoURL from signInWithGoogle).
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Counsellor photos and resource art served from Firebase Storage.
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

export default nextConfig;
