'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { LinkComponent } from './LinkComponent'

const NAV: { label: string; href: string }[] = [
  { label: 'home', href: '/' },
  { label: 'about', href: '/about' },
  { label: 'members', href: '/admin' },
  { label: 'gate', href: '/examples/prove-signature' },
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
    </header>
  )
}
