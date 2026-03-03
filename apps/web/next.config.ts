import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  experimental: {
    externalDir: true,
  },
  // Point Turbopack at the monorepo root so workspace resolution is deterministic.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
