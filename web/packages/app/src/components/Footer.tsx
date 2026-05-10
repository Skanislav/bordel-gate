import React from 'react'

export function Footer() {
  return (
    <footer className='border-t border-[var(--bordel-fg-muted)] flex justify-between items-center px-4 py-2 text-[10px] opacity-60'>
      <span>(c) 2025 bordel.collective · best viewed in lynx · 1024x768+</span>
      <span>
        visits: <span className='border border-[var(--bordel-fg)] px-1'>001337</span> · state: live
        <span className='animate-pulse'>_</span>
      </span>
    </footer>
  )
}
