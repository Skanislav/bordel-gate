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
  // bb.js resolves its WASM via paths relative to its own files. Bundling it
  // through webpack rewrites those paths and the runtime can't find the wasm.
  // Marking it external keeps the package on disk and uses Node's require, so
  // bb.js's own resolver works. Server-only — the client bundle still needs
  // it bundled for the prove page.
  serverExternalPackages: ['@aztec/bb.js'],
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
