import { describe, it, expect, vi } from 'vitest'
import { readWalletRegistry } from '../registry'

const RESOLVER = '0x0000000000000000000000000000000000000001' as const
const NODE = '0xabababababababababababababababababababababababababababababababab' as const

function makeClient(values: Record<string, string>) {
  return {
    readContract: vi.fn(async ({ args }: { args: readonly unknown[] }) => {
      const key = args[1] as string
      return values[key] ?? ''
    }),
  } as unknown as Parameters<typeof readWalletRegistry>[0]['client']
}

describe('readWalletRegistry', () => {
  it('returns memberRoot, challengeDomain, and challengeVersion', async () => {
    const client = makeClient({
      'bordel.member-root': '0x' + '33'.repeat(32),
      'bordel.challenge-domain': 'BORDEL_AUTH_V2',
      'bordel.challenge-version': '3',
    })
    const r = await readWalletRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    expect(r.memberRoot).toBe('0x' + '33'.repeat(32))
    expect(r.challengeDomain).toBe('BORDEL_AUTH_V2')
    expect(r.challengeVersion).toBe('3')
  })

  it('throws when memberRoot is unset', async () => {
    const client = makeClient({})
    await expect(
      readWalletRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    ).rejects.toThrow(/member-root/)
  })

  it('returns empty challengeDomain/Version when unset (caller falls back)', async () => {
    const client = makeClient({ 'bordel.member-root': '0x' + '44'.repeat(32) })
    const r = await readWalletRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    expect(r.challengeDomain).toBe('')
    expect(r.challengeVersion).toBe('')
  })
})
