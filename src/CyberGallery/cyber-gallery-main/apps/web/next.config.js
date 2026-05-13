/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  transpilePackages: ['@cg/shared'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:4817/api/:path*' },
    ];
  },
};
