import type { Address, Hex } from 'viem'

const FIXED_KEYS = [
  'bordel.member-root',
  'bordel.gateway-signer',
  'bordel.gateway-url',
  'bordel.freshness-window',
  'bordel.challenge-domain',
  'bordel.capabilities',
] as const

export type FixedKey = (typeof FIXED_KEYS)[number]

export const ADMIN_FIXED_KEYS: readonly FixedKey[] = FIXED_KEYS

export interface AdminEnv {
  resolver: Address
  bordelNode: Hex
}

export function readAdminEnv(): AdminEnv {
  const resolver = process.env.NEXT_PUBLIC_BORDEL_RESOLVER as Address | undefined
  const bordelNode = process.env.NEXT_PUBLIC_BORDEL_NODE as Hex | undefined
  if (!resolver) throw new Error('NEXT_PUBLIC_BORDEL_RESOLVER is not set')
  if (!bordelNode) throw new Error('NEXT_PUBLIC_BORDEL_NODE is not set')
  return { resolver, bordelNode }
}
