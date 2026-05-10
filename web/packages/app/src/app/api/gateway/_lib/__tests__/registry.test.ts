import { describe, it, expect, vi } from 'vitest'
import { readRegistry } from '../registry'

function makeMockClient(textReturns: Record<string, string>) {
  return {
    readContract: vi.fn(async ({ args }: { args: readonly unknown[] }) => {
      const key = args[1] as string
      return textReturns[key] ?? ''
    }),
  } as unknown as Parameters<typeof readRegistry>[0]['client']
}

const RESOLVER = '0x0000000000000000000000000000000000000001' as const
const NODE = '0xabababababababababababababababababababababababababababababababab' as const

describe('readRegistry', () => {
  it('returns parsed root and configured domain/version', async () => {
    const client = makeMockClient({
      'bordel.member-root':
        '0x' + '11'.repeat(32),
      'bordel.challenge-domain': 'BORDEL_AUTH_V2',
      'bordel.challenge-version': '2',
    })
    const r = await readRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    expect(r.memberRoot).toBe('0x' + '11'.repeat(32))
    expect(r.challengeDomain).toBe('BORDEL_AUTH_V2')
    expect(r.challengeVersion).toBe('2')
  })

  it('returns empty domain/version when unset (caller falls back to defaults)', async () => {
    const client = makeMockClient({
      'bordel.member-root': '0x' + '22'.repeat(32),
    })
    const r = await readRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    expect(r.challengeDomain).toBe('')
    expect(r.challengeVersion).toBe('')
  })

  it('throws when member-root is unset', async () => {
    const client = makeMockClient({})
    await expect(
      readRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    ).rejects.toThrow(/member-root/)
  })
})
