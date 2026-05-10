import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { cookieStorage, createConfig, createStorage, http, injected, type Config } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { ETH_CHAINS } from './network'

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

// When the project ID is missing we deliberately skip the WalletConnect-aware
// adapter in context/Web3.tsx and fall back to a wagmi config that only knows
// about injected wallets. Without this guard the WalletConnect relay
// connection hangs on mobile and freezes the React tree (the rest of the app
// — HaLo signing, member sync — never gets to mount).
export const WALLETCONNECT_DISABLED = !WALLETCONNECT_PROJECT_ID
if (WALLETCONNECT_DISABLED) {
  console.warn(
    '[bordel] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — wallet connect is disabled. ' +
      'Get a project ID at https://cloud.reown.com and put it in web/packages/app/.env.local',
  )
}

// Built only when WC is enabled — instantiating WagmiAdapter at all triggers
// WalletConnect connector wiring that pings the relay with the bad project ID.
export const WALLETCONNECT_ADAPTER = WALLETCONNECT_DISABLED
  ? null
  : new WagmiAdapter({
      projectId: WALLETCONNECT_PROJECT_ID,
      networks: ETH_CHAINS,
      ssr: true,
      storage: createStorage({ storage: cookieStorage }),
    })

// Plain wagmi config used as a fallback when WC is disabled. injected() covers
// MetaMask / Rabby / Frame / any in-browser wallet without going near the
// WalletConnect SDK. mainnet is the only transport — adjust if a multi-chain
// fallback is ever needed.
const FALLBACK_WAGMI_CONFIG: Config = createConfig({
  chains: [mainnet],
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  connectors: [injected()],
  transports: { [mainnet.id]: http() },
})

export const WAGMI_CONFIG: Config =
  WALLETCONNECT_ADAPTER !== null
    ? (WALLETCONNECT_ADAPTER.wagmiConfig as Config)
    : FALLBACK_WAGMI_CONFIG
