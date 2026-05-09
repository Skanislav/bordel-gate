import type { Hex } from 'viem'
import {
  computeChallenge,
  DEFAULT_CHALLENGE_DOMAIN,
} from '@/app/api/gateway/_lib/challenge'

export interface BuildChallengeInput {
  domain: string
  nonce: Hex
  node: Hex
}

export function buildChallenge(input: BuildChallengeInput): Hex {
  return computeChallenge(input)
}

export { DEFAULT_CHALLENGE_DOMAIN }
