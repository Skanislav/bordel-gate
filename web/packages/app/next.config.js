/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output produces a self-contained .next/standalone/ tree with
  // only the modules the app actually uses, plus a server.js entry. Required
  // for the slim Railway runtime image (web/Dockerfile copies just that tree).
  output: 'standalone',
  // For yarn workspaces the standalone tracer needs to know where the
  // monorepo root is — otherwise it walks up to /, prints lockfile warnings,
  // and may miss workspace-local dependencies.
  outputFileTracingRoot: require('node:path').join(__dirname, '../..'),
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    config.experiments = { ...config.experiments, asyncWebAssembly: true }
    return config
  },
  async headers() {
    return [
      {
        source: '/examples/prove-signature',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [{ hostname: '*' }],
  },
}

module.exports = nextConfig
