// AUTO-GENERATED from ecdsa_validator.json by ecdsa_validator/scripts/sync_to_web.mjs
// Do not edit by hand; rerun `npm run sync` in ecdsa_validator/ after circuit changes.

export const CIRCUIT_NAME = 'ecdsa_validator' as const
export const CIRCUIT_HASH = "1671727323256716082" as const
export const NOIR_VERSION = "1.0.0-beta.19+842974fcf034b0a652631e69fc24f92f9ddd1d37" as const
export const PUBLIC_PARAMS = ['challenge', 'root', 'leaf'] as const

export type EcdsaValidatorInput = {
  pub_key_x: number[]
  pub_key_y: number[]
  signature: number[]
  merkle_path: string[]
  merkle_indices: boolean[]
  challenge: number[]
  root: string
  leaf: string
}
