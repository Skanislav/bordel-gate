import type { Address, Hex, PublicClient } from 'viem'

const TEXT_ABI = [
  {
    name: 'text',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export interface WalletRegistryInput {
  client: Pick<PublicClient, 'readContract'>
  resolver: Address
  bordelNode: Hex
}

export interface WalletRegistry {
  memberRoot: Hex
  challengeDomain: string
  challengeVersion: string
}

async function text(input: WalletRegistryInput, key: string): Promise<string> {
  return (await input.client.readContract({
    address: input.resolver,
    abi: TEXT_ABI,
    functionName: 'text',
    args: [input.bordelNode, key],
  })) as string
}

export async function readWalletRegistry(input: WalletRegistryInput): Promise<WalletRegistry> {
  const [memberRoot, challengeDomain, challengeVersion] = await Promise.all([
    text(input, 'bordel.member-root'),
    text(input, 'bordel.challenge-domain'),
    text(input, 'bordel.challenge-version'),
  ])
  if (!memberRoot) throw new Error('wallet-registry: bordel.member-root is unset')
  return {
    memberRoot: memberRoot as Hex,
    challengeDomain,
    challengeVersion,
  }
}
