import { createPublicClient, http, type Address, type Hex, type PublicClient } from 'viem'
import { sepolia } from 'viem/chains'

export function getReadClient(): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(process.env.BORDEL_RPC_URL),
  })
}

export function getResolverAddress(): Address {
  const a = process.env.BORDEL_RESOLVER
  if (!a) throw new Error('BORDEL_RESOLVER is not set')
  return a as Address
}

export function getBordelNode(): Hex {
  const n = process.env.BORDEL_NODE
  if (!n) throw new Error('BORDEL_NODE is not set')
  return n as Hex
}

export async function getCurrentBlock(): Promise<{ number: bigint; hash: Hex }> {
  const client = getReadClient()
  const block = await client.getBlock({ blockTag: 'latest' })
  return { number: block.number - 1n, hash: block.hash as Hex }
}
