import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/salesforce-consulting",
        destination: "/platform-strategy",
        permanent: true,
      },
      {
        source: "/business-process-automation",
        destination: "/operational-intelligence",
        permanent: true,
      },
      {
        source: "/web-development",
        destination: "/digital-experience",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
