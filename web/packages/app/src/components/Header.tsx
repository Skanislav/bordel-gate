'use client'

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { LinkComponent } from './LinkComponent'

const NAV: { label: string; href: string }[] = [
  { label: 'home', href: '/' },
  { label: 'commit', href: '/commit' },
  { label: 'verify', href: '/verify' },
]

export function Header() {
  const pathname = usePathname() ?? '/'
  return (
    <header className='border-b border-[var(--bordel-fg-muted)] flex justify-between items-center px-4 py-2 text-[var(--bordel-fg)]'>
      <div className='flex items-center gap-3 text-sm'>
        <LinkComponent href='/'>
          <span className='inline-flex items-center'>
            <span className='border border-[var(--bordel-fg)] px-1.5 py-[1px] mr-2 text-xs leading-none'>8</span>
            <span className='font-bold tracking-wider'>BORDEL</span>
          </span>
        </LinkComponent>
        <span className='opacity-50 hidden sm:inline'>hackerspace network</span>
      </div>
      <div className='flex items-center gap-2'>
        <nav className='flex gap-1 text-xs'>
          {NAV.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <LinkComponent key={item.href} href={item.href}>
                <span
                  className={
                    active
                      ? 'border border-[var(--bordel-fg)] px-2 py-1 text-[var(--bordel-fg)]'
                      : 'border border-transparent px-2 py-1 opacity-60 hover:opacity-100 hover:border-[var(--bordel-fg-muted)]'
                  }>
                  [{item.label}]
                </span>
              </LinkComponent>
            )
          })}
        </nav>
        <WalletPill />
      </div>
    </header>
  )
}

function WalletPill() {
  const { address, isConnected } = useAccount()
  const { connectAsync, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [error, setError] = useState<string | null>(null)

  const onConnect = async () => {
    setError(null)
    try {
      const inj = connectors.find((c) => c.id === 'injected') ?? connectors[0]
      if (!inj) throw new Error('no injected wallet — install MetaMask / Rabby / Frame')
      await connectAsync({ connector: inj })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/user rejected|rejected the request|denied|4001/i.test(msg)) {
        setError(msg)
      }
    }
  }

  if (isConnected && address) {
    return (
      <button
        type='button'
        onClick={() => disconnect()}
        title={`${address} — click to disconnect`}
        className='border border-[var(--bordel-fg-muted)] hover:border-[var(--bordel-fg)] px-2 py-1 text-xs font-mono'>
        [{address.slice(0, 6)}…{address.slice(-4)} ×]
      </button>
    )
  }

  return (
    <button
      type='button'
      onClick={onConnect}
      disabled={isPending}
      title={error ?? 'connect injected wallet'}
      className='border border-[var(--bordel-fg-muted)] hover:border-[var(--bordel-fg)] disabled:opacity-40 px-2 py-1 text-xs'>
      [{isPending ? 'connecting…' : 'connect'}]
    </button>
  )
}
