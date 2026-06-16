import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  // GullyScore doesn't use next/image — disable the optimization API so the
  // standalone build doesn't have to ship sharp (~33MB of native binaries).
  images: {
    unoptimized: true,
  },
  // Allow the Space-Z.ai preview proxy to load /_next/* assets without
  // Next.js dev server blocking the cross-origin request.
  allowedDevOrigins: [
    "https://*.space-z.ai",
    "http://*.space-z.ai",
  ],
};

export default nextConfig;
