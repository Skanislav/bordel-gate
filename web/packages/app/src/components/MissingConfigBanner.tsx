'use client'

import { WALLETCONNECT_DISABLED } from '@/utils/web3'

// Visible diagnostic so the user can tell from the device — including mobile
// where the JS console is hard to reach — that WalletConnect is misconfigured.
// Without this the symptom is a silently broken connect button (and on some
// mobile builds, a frozen page during AppKit init).
export function MissingConfigBanner() {
  if (!WALLETCONNECT_DISABLED) return null
  return (
    <div className='alert alert-warning rounded-none text-xs'>
      <div className='flex flex-col gap-1'>
        <span className='font-semibold'>Wallet Connect is disabled</span>
        <span>
          <code>NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code> is not set. Wallet sign-in won&apos;t work; HaLo
          tap and member sync still do. Get a project ID at <code>https://cloud.reown.com</code> and add it to{' '}
          <code>web/packages/app/.env.local</code>, then restart <code>yarn dev</code>.
        </span>
      </div>
    </div>
  )
}
