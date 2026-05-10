'use client'

import { createAppKit } from '@reown/appkit/react'
import { PropsWithChildren } from 'react'
import { cookieToInitialState, WagmiProvider } from 'wagmi'
import {
  WAGMI_CONFIG,
  WALLETCONNECT_ADAPTER,
  WALLETCONNECT_DISABLED,
  WALLETCONNECT_PROJECT_ID,
} from '@/utils/web3'
import { SITE_NAME, SITE_INFO, SITE_URL } from '@/utils/site'
import { ETH_CHAINS } from '@/utils/network'
import { mainnet } from '@reown/appkit/networks'

interface Props extends PropsWithChildren {
  cookies: string | null
}

const metadata = {
  name: SITE_NAME,
  description: SITE_INFO,
  url: SITE_URL,
  icons: ['https://avatars.githubusercontent.com/u/25974464'],
}

// Skip AppKit init when the project ID is missing. With an empty projectId
// AppKit hangs the React tree on mobile while it tries to dial the
// WalletConnect relay, which freezes everything below WagmiProvider —
// including the HaLo flow and member-tree sync that don't actually need
// WalletConnect. The fallback wagmi config in @/utils/web3 still mounts via
// WagmiProvider so wagmi hooks (useAccount, useChainId, useSignTypedData)
// continue to work for the HaLo and injected-wallet paths.
//
// Also: features.analytics/email/onramp pull in extra mobile flows and an
// async fetch to a Reown analytics endpoint — they're slow and unnecessary
// for our flows, so they're off.
if (!WALLETCONNECT_DISABLED && WALLETCONNECT_ADAPTER !== null) {
  try {
    createAppKit({
      adapters: [WALLETCONNECT_ADAPTER],
      projectId: WALLETCONNECT_PROJECT_ID,
      networks: [mainnet, ...ETH_CHAINS],
      defaultNetwork: mainnet,
      metadata: metadata,
      features: {
        analytics: false,
        email: false,
        onramp: false,
      },
    })
  } catch (err) {
    console.error('[bordel] createAppKit failed; wallet connect disabled', err)
  }
}

export function Web3Provider(props: Props) {
  // cookieToInitialState can throw on malformed cookies (rare but seen on
  // mobile when migrating between configs); fall back to no initial state
  // rather than block hydration.
  let initialState
  try {
    initialState = cookieToInitialState(WAGMI_CONFIG, props.cookies)
  } catch (err) {
    console.warn('[bordel] cookieToInitialState failed; starting with empty state', err)
    initialState = undefined
  }

  return (
    <WagmiProvider config={WAGMI_CONFIG} initialState={initialState}>
      {props.children}
    </WagmiProvider>
  )
}
