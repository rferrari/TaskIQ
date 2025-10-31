import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,

  webpack: (config, { dev }) => {
    if (dev) {
      config.devtool = 'eval-source-map'; // Best for debugging
    }
    return config;
  },
};

export default nextConfig;
