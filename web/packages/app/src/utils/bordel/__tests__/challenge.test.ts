import { describe, it, expect } from 'vitest'
import { computeChallenge as gatewayChallenge, DEFAULT_CHALLENGE_DOMAIN } from '@/app/api/gateway/_lib/challenge'
import { buildChallenge } from '../challenge'

const node = '0xabababababababababababababababababababababababababababababababab' as const
const nonce = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd' as const

describe('buildChallenge', () => {
  it('matches the gateway algorithm with default domain', () => {
    const w = buildChallenge({ domain: '', nonce, node })
    const g = gatewayChallenge({ domain: DEFAULT_CHALLENGE_DOMAIN, nonce, node })
    expect(w).toBe(g)
  })

  it('matches the gateway algorithm with custom domain', () => {
    const w = buildChallenge({ domain: 'BORDEL_AUTH_V2', nonce, node })
    const g = gatewayChallenge({ domain: 'BORDEL_AUTH_V2', nonce, node })
    expect(w).toBe(g)
  })
})
