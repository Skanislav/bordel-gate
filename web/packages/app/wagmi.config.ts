import { defineConfig } from '@wagmi/cli'
import { actions, hardhat, foundry } from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'src/abis.ts',
  contracts: [],
  plugins: [
    actions(),
    foundry({
      project: '../../../bordel-eth-verifier',
      deployments: {
        HonkVerifier: {
          11155111: '0x34A1D3fff3958843C43aD80F30b94c510645C316',
          31337: '0x34A1D3fff3958843C43aD80F30b94c510645C316',
        },
      },
    }),
  ],
})
