import { describe, it, expect, vi, beforeEach } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { type Hex, recoverAddress, hashTypedData, decodeAbiParameters } from 'viem'
import { computeChallenge, DEFAULT_CHALLENGE_DOMAIN } from '../../_lib/challenge'
import { RECEIPT_ABI, RECEIPT_TYPES, buildDomain } from '../../_lib/receipt'

const ACCOUNT = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const NODE = '0xabababababababababababababababababababababababababababababababab' as const
const NONCE = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd' as const
const ROOT = ('0x' + '11'.repeat(32)) as Hex
const SKAS_LEAF = ('0x' + '00'.repeat(32)) as Hex

vi.mock('../../_lib/registry', () => ({
  readRegistry: vi.fn(async () => ({ memberRoot: ROOT, challengeDomain: '' })),
}))

vi.mock('../../_lib/sign-config', () => ({
  getSignerAccount: () => ACCOUNT,
}))

const RESOLVER = '0x0000000000000000000000000000000000000001' as const
const CHAIN_ID = 11155111

vi.mock('../../_lib/chain-config', () => ({
  getReadClient: () => ({}),
  getResolverAddress: () => RESOLVER,
  getBordelNode: () => NODE,
  getCurrentBlock: async () => ({ number: 100n, hash: ('0x' + '22'.repeat(32)) as Hex }),
  getChainId: () => CHAIN_ID,
}))

import { POST } from '../route'

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'door.skas.bordel.eth',
    node: NODE,
    selector: '0x3b3b57de',
    selectorArgs: [],
    nonce: NONCE,
    proof: '0xdeadbeef',
    publicInputs: {
      challenge: computeChallenge({ domain: DEFAULT_CHALLENGE_DOMAIN, nonce: NONCE, node: NODE }),
      root: ROOT,
      leaf: SKAS_LEAF,
    },
    ...overrides,
  }
}

async function callPost(body: unknown) {
  return POST(new Request('http://test/api/gateway/lookup', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
}

describe('POST /api/gateway/lookup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path → 200 with signed receipt', async () => {
    const res = await callPost(makeBody())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: Hex }
    expect(json.data).toMatch(/^0x[0-9a-f]+$/i)

    // Decode (Receipt, bytes) tuple
    const [decoded, signature] = decodeAbiParameters(
      [RECEIPT_ABI[0], { type: 'bytes' }],
      json.data,
    ) as [
      { node: Hex; value: Hex; signedRoot: Hex; blockNum: bigint; blockHash: Hex },
      Hex,
    ]

    // Verify signer (EIP-712)
    const digest = hashTypedData({
      domain: buildDomain(CHAIN_ID, RESOLVER),
      types: RECEIPT_TYPES,
      primaryType: 'Receipt',
      message: decoded,
    })
    const recovered = await recoverAddress({ hash: digest, signature })
    expect(recovered.toLowerCase()).toBe(ACCOUNT.address.toLowerCase())

    expect(decoded.node).toBe(NODE)
    expect(decoded.signedRoot).toBe(ROOT)
    expect(decoded.blockNum).toBe(100n)
  })

  it('challenge mismatch → 400', async () => {
    const body = makeBody({
      publicInputs: {
        challenge: '0x' + 'ff'.repeat(32),
        root: ROOT,
        leaf: SKAS_LEAF,
      },
    })
    const res = await callPost(body)
    expect(res.status).toBe(400)
  })

  it('root mismatch → 403', async () => {
    const body = makeBody({
      publicInputs: {
        challenge: computeChallenge({ domain: DEFAULT_CHALLENGE_DOMAIN, nonce: NONCE, node: NODE }),
        root: '0x' + 'ee'.repeat(32),
        leaf: SKAS_LEAF,
      },
    })
    const res = await callPost(body)
    expect(res.status).toBe(403)
  })

  it('leaf not in DB → 404', async () => {
    const body = makeBody({
      name: 'door.unknown.bordel.eth',
      publicInputs: {
        challenge: computeChallenge({ domain: DEFAULT_CHALLENGE_DOMAIN, nonce: NONCE, node: NODE }),
        root: ROOT,
        leaf: '0x' + 'aa'.repeat(32),
      },
    })
    const res = await callPost(body)
    expect(res.status).toBe(404)
  })

  it('member lacks capability → 403', async () => {
    const body = makeBody({
      name: 'lounge.skas.bordel.eth',
    })
    const res = await callPost(body)
    expect(res.status).toBe(403)
  })

  it('domain configured on chain → request must use it', async () => {
    const { readRegistry } = await import('../../_lib/registry')
    vi.mocked(readRegistry).mockResolvedValueOnce({
      memberRoot: ROOT,
      challengeDomain: 'BORDEL_AUTH_V2',
    })
    const body = makeBody({
      publicInputs: {
        challenge: computeChallenge({ domain: 'BORDEL_AUTH_V2', nonce: NONCE, node: NODE }),
        root: ROOT,
        leaf: SKAS_LEAF,
      },
    })
    const res = await callPost(body)
    expect(res.status).toBe(200)
  })
})
