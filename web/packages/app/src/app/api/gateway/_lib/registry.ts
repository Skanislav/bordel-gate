import type { Address, Hex, PublicClient } from 'viem'

export const RESOLVER_ABI = [
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

export interface RegistryReadInput {
  client: Pick<PublicClient, 'readContract'>
  resolver: Address
  bordelNode: Hex
}

export interface RegistryView {
  memberRoot: Hex
  challengeDomain: string
  challengeVersion: string
}

async function readText(input: RegistryReadInput, key: string): Promise<string> {
  return (await input.client.readContract({
    address: input.resolver,
    abi: RESOLVER_ABI,
    functionName: 'text',
    args: [input.bordelNode, key],
  })) as string
}

export async function readRegistry(input: RegistryReadInput): Promise<RegistryView> {
  const [memberRoot, challengeDomain, challengeVersion] = await Promise.all([
    readText(input, 'bordel.member-root'),
    readText(input, 'bordel.challenge-domain'),
    readText(input, 'bordel.challenge-version'),
  ])
  if (!memberRoot) throw new Error('registry: bordel.member-root is unset')
  return {
    memberRoot: memberRoot as Hex,
    challengeDomain,
    challengeVersion,
  }
}
