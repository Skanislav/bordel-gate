import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { Hex } from 'viem'

export function getSignerAccount(): PrivateKeyAccount {
  const key = process.env.BORDEL_GATEWAY_SIGNER_KEY
  if (!key) throw new Error('BORDEL_GATEWAY_SIGNER_KEY is not set')
  return privateKeyToAccount(key as Hex)
}
