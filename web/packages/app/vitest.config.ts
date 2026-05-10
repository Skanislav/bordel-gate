import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    env: {
      BORDEL_GATEWAY_SIGNER_KEY:
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      BORDEL_RESOLVER: '0x0000000000000000000000000000000000000001',
      BORDEL_NODE:
        '0xabababababababababababababababababababababababababababababababab',
      BORDEL_RPC_URL: 'http://localhost:1',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
