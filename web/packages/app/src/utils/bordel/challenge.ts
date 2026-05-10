import {
  DEFAULT_CHALLENGE_DOMAIN,
  DEFAULT_CHALLENGE_VERSION,
  CHALLENGE_TYPES,
  buildChallengeDomain,
  buildChallengeTypedData,
  computeChallenge,
  type ChallengeDomainFields,
  type ChallengeMessage,
} from '@/app/api/gateway/_lib/challenge'

export {
  DEFAULT_CHALLENGE_DOMAIN,
  DEFAULT_CHALLENGE_VERSION,
  CHALLENGE_TYPES,
  buildChallengeDomain,
  buildChallengeTypedData,
  computeChallenge,
}
export type { ChallengeDomainFields, ChallengeMessage }

export function buildChallenge(
  fields: ChallengeDomainFields,
  message: ChallengeMessage,
) {
  return computeChallenge(fields, message)
}
