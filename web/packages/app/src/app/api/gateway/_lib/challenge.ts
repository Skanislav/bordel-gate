import { keccak256, concat, toBytes, stringToBytes, type Hex } from 'viem'

export const DEFAULT_CHALLENGE_DOMAIN = 'BORDEL_AUTH_V1'

export function computeChallenge(input: { domain: string; nonce: Hex; node: Hex }): Hex {
  const domainBytes = stringToBytes(input.domain || DEFAULT_CHALLENGE_DOMAIN)
  return keccak256(
    concat([toBytes(keccak256(domainBytes)), toBytes(input.nonce), toBytes(input.node)])
  )
}
