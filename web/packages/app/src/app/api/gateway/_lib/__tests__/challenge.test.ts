import { describe, it, expect } from 'vitest'
import { keccak256, toBytes, concat, stringToBytes } from 'viem'
import { computeChallenge, DEFAULT_CHALLENGE_DOMAIN } from '../challenge'

const node = '0xabababababababababababababababababababababababababababababababab' as const
const nonce = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd' as const

describe('computeChallenge', () => {
  it('uses the default domain when domain is empty', () => {
    const expected = keccak256(
      concat([toBytes(keccak256(stringToBytes(DEFAULT_CHALLENGE_DOMAIN))), toBytes(nonce), toBytes(node)])
    )
    expect(computeChallenge({ domain: '', nonce, node })).toBe(expected)
  })

  it('uses the configured domain when set', () => {
    const domain = 'BORDEL_AUTH_V2'
    const expected = keccak256(
      concat([toBytes(keccak256(stringToBytes(domain))), toBytes(nonce), toBytes(node)])
    )
    expect(computeChallenge({ domain, nonce, node })).toBe(expected)
  })

  it('different domain → different challenge', () => {
    const a = computeChallenge({ domain: 'A', nonce, node })
    const b = computeChallenge({ domain: 'B', nonce, node })
    expect(a).not.toBe(b)
  })

  it('different nonce → different challenge', () => {
    const otherNonce = '0x0000000000000000000000000000000000000000000000000000000000000001' as const
    const a = computeChallenge({ domain: 'X', nonce, node })
    const b = computeChallenge({ domain: 'X', nonce: otherNonce, node })
    expect(a).not.toBe(b)
  })

  it('different node → different challenge', () => {
    const otherNode = '0x0000000000000000000000000000000000000000000000000000000000000002' as const
    const a = computeChallenge({ domain: 'X', nonce, node })
    const b = computeChallenge({ domain: 'X', nonce, node: otherNode })
    expect(a).not.toBe(b)
  })
})
