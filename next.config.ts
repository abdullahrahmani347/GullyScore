import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow the Space-Z.ai preview proxy to load /_next/* assets without
  // Next.js dev server blocking the cross-origin request.
  allowedDevOrigins: [
    "https://*.space-z.ai",
    "http://*.space-z.ai",
  ],
};

export default nextConfig;
