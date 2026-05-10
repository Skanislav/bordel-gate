import { hashTypedData, type Address, type Hex } from 'viem'

export const DEFAULT_CHALLENGE_DOMAIN = 'BORDEL_AUTH_V1'
export const DEFAULT_CHALLENGE_VERSION = '1'

export const CHALLENGE_TYPES = {
  Challenge: [
    { name: 'nonce', type: 'bytes32' },
    { name: 'node', type: 'bytes32' },
  ],
} as const

export interface ChallengeDomainFields {
  domain: string
  version: string
  chainId: number
  verifyingContract: Address
}

export interface ChallengeMessage {
  nonce: Hex
  node: Hex
}

export function buildChallengeDomain(fields: ChallengeDomainFields) {
  return {
    name: fields.domain || DEFAULT_CHALLENGE_DOMAIN,
    version: fields.version || DEFAULT_CHALLENGE_VERSION,
    chainId: fields.chainId,
    verifyingContract: fields.verifyingContract,
  } as const
}

export function buildChallengeTypedData(
  fields: ChallengeDomainFields,
  message: ChallengeMessage,
) {
  return {
    domain: buildChallengeDomain(fields),
    types: CHALLENGE_TYPES,
    primaryType: 'Challenge' as const,
    message,
  }
}

export function computeChallenge(
  fields: ChallengeDomainFields,
  message: ChallengeMessage,
): Hex {
  return hashTypedData(buildChallengeTypedData(fields, message))
}
