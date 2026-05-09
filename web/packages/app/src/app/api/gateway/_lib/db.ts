import type { Address, Hex } from 'viem'

export interface MemberRecord {
  name: string
  leaf: Hex
  address: Address
  capabilities: string[]
}

const FIXTURES: Record<string, MemberRecord> = {
  'skas.bordel.eth': {
    name: 'skas.bordel.eth',
    leaf: '0x' + '00'.repeat(32) as Hex,
    address: '0x000000000000000000000000000000000000beef',
    capabilities: ['door', 'gym', 'kitchen'],
  },
}

export function lookupMember(name: string): MemberRecord | undefined {
  // door.skas.bordel.eth → strip the capability label, member is skas.bordel.eth
  const parts = name.split('.')
  if (parts.length < 4) return undefined
  const memberName = parts.slice(1).join('.')
  return FIXTURES[memberName]
}

export function capabilityOf(name: string): string {
  // First label is the capability for door.skas.bordel.eth → 'door'.
  const parts = name.split('.')
  return parts[0]
}
