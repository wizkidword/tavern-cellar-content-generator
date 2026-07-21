import type { NextConfig } from "next";

function configuredOriginHost() {
  try {
    return new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3000").host;
  } catch {
    return "127.0.0.1:3000";
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      allowedOrigins: [configuredOriginHost()],
    },
  },
};

export default nextConfig;
