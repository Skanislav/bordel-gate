/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
