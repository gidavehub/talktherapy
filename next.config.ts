import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin and google-auth-library use Node built-ins and dynamic
  // requires that the bundler cannot statically analyse. Bundling them breaks
  // credential loading at runtime, so they stay external and are required from
  // node_modules by the server at request time.
  serverExternalPackages: ["firebase-admin", "google-auth-library"],
  turbopack: {
    root: __dirname,
  },
  // The directory used to live at two URLs under two names. One concept, one
  // URL now — these keep old links and any existing bookmarks working.
  async redirects() {
    return [
      { source: "/therapists", destination: "/providers", permanent: true },
      { source: "/therapists/:id", destination: "/providers/:id", permanent: true },
      { source: "/counsellors", destination: "/matches", permanent: true },
      { source: "/for-counsellors", destination: "/for-providers", permanent: true },
    ];
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
      // Provider photos and resource art served from Firebase Storage.
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

export default nextConfig;
