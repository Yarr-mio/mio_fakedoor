import type { NextConfig } from 'next';
// Admin authentication requires a server runtime; never publish stale out/ files.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  async headers() {
    return ['/prototype-review/:path*', '/review/:path*', '/tone-guide/:path*', '/admin/:path*', '/api/admin/:path*'].map(source => ({
      source,
      headers: [
        { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }));
  },
};
export default nextConfig;
