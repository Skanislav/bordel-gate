import { describe, it, expect } from 'vitest'
import { computeChallenge as gatewayChallenge } from '@/app/api/gateway/_lib/challenge'
import { buildChallenge } from '../challenge'

const node = '0xabababababababababababababababababababababababababababababababab' as const
const nonce = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd' as const
const fields = {
  domain: 'BORDEL_AUTH_V1',
  version: '1',
  chainId: 11155111,
  verifyingContract: '0x0000000000000000000000000000000000000001' as const,
}
const message = { nonce, node }

describe('buildChallenge (wallet-side)', () => {
  it('matches the gateway algorithm with explicit fields', () => {
    expect(buildChallenge(fields, message)).toBe(gatewayChallenge(fields, message))
  })

  it('matches across default-domain fallback', () => {
    const w = buildChallenge({ ...fields, domain: '' }, message)
    const g = gatewayChallenge({ ...fields, domain: '' }, message)
    expect(w).toBe(g)
  })
})
