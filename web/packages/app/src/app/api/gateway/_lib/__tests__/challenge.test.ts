import { describe, it, expect } from 'vitest'
import { hashTypedData } from 'viem'
import {
  buildChallengeDomain,
  buildChallengeTypedData,
  CHALLENGE_TYPES,
  computeChallenge,
  DEFAULT_CHALLENGE_DOMAIN,
  DEFAULT_CHALLENGE_VERSION,
} from '../challenge'

const node = '0xabababababababababababababababababababababababababababababababab' as const
const nonce = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd' as const
const verifyingContract = '0x0000000000000000000000000000000000000001' as const
const chainId = 11155111

const fields = { domain: '', version: '', chainId, verifyingContract }
const message = { nonce, node }

describe('computeChallenge (EIP-712)', () => {
  it('returns the EIP-712 hash of the typed data', () => {
    const result = computeChallenge(fields, message)
    const expected = hashTypedData({
      domain: {
        name: DEFAULT_CHALLENGE_DOMAIN,
        version: DEFAULT_CHALLENGE_VERSION,
        chainId,
        verifyingContract,
      },
      types: CHALLENGE_TYPES,
      primaryType: 'Challenge',
      message,
    })
    expect(result).toBe(expected)
  })

  it('falls back to default domain when empty', () => {
    expect(buildChallengeDomain(fields).name).toBe(DEFAULT_CHALLENGE_DOMAIN)
    expect(buildChallengeDomain({ ...fields, domain: 'BORDEL_AUTH_V2' }).name).toBe('BORDEL_AUTH_V2')
  })

  it('falls back to default version when empty', () => {
    expect(buildChallengeDomain(fields).version).toBe(DEFAULT_CHALLENGE_VERSION)
    expect(buildChallengeDomain({ ...fields, version: '2' }).version).toBe('2')
  })

  it('different domain → different challenge', () => {
    const a = computeChallenge({ ...fields, domain: 'A' }, message)
    const b = computeChallenge({ ...fields, domain: 'B' }, message)
    expect(a).not.toBe(b)
  })

  it('different version → different challenge', () => {
    const a = computeChallenge({ ...fields, version: '1' }, message)
    const b = computeChallenge({ ...fields, version: '2' }, message)
    expect(a).not.toBe(b)
  })

  it('different chainId → different challenge', () => {
    const a = computeChallenge({ ...fields, chainId: 1 }, message)
    const b = computeChallenge({ ...fields, chainId: 11155111 }, message)
    expect(a).not.toBe(b)
  })

  it('different verifyingContract → different challenge', () => {
    const a = computeChallenge(
      { ...fields, verifyingContract: '0x0000000000000000000000000000000000000001' },
      message,
    )
    const b = computeChallenge(
      { ...fields, verifyingContract: '0x0000000000000000000000000000000000000002' },
      message,
    )
    expect(a).not.toBe(b)
  })

  it('different nonce → different challenge', () => {
    const a = computeChallenge(fields, message)
    const b = computeChallenge(fields, {
      ...message,
      nonce: '0x0000000000000000000000000000000000000000000000000000000000000001',
    })
    expect(a).not.toBe(b)
  })

  it('different node → different challenge', () => {
    const a = computeChallenge(fields, message)
    const b = computeChallenge(fields, {
      ...message,
      node: '0x0000000000000000000000000000000000000000000000000000000000000002',
    })
    expect(a).not.toBe(b)
  })
})

describe('buildChallengeTypedData', () => {
  it('returns a structure usable directly with signTypedData', () => {
    const td = buildChallengeTypedData(fields, message)
    expect(td.primaryType).toBe('Challenge')
    expect(td.types).toBe(CHALLENGE_TYPES)
    expect(td.message).toEqual(message)
    expect(td.domain.name).toBe(DEFAULT_CHALLENGE_DOMAIN)
  })
})
