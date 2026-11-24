import type { NextConfig } from 'next';

// Where the API listens, seen from the Next server rather than the browser.
// The browser never learns this address: it talks to `/api/*` on the site's
// own origin and Next forwards the request. One origin means the API needs no
// CORS rules, and the refresh cookie never has to cross between two sites.
const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

const config: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default config;
