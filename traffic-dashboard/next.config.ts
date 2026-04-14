import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',  // smaller Docker image
  async rewrites() {
    return [
      {
        // Proxy API calls to traffic-api service (avoids CORS in dev)
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
