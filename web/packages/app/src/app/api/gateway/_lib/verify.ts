import type { Hex } from 'viem'

export interface PublicInputs {
  challenge: Hex
  root: Hex
  leaf: Hex
}

/**
 * Real implementation lands with circuit work in the parent spec.
 * For now: trust the publicInputs; gateway logic can be exercised end-to-end.
 */
export async function verifyProof(_proof: Hex, _publicInputs: PublicInputs): Promise<boolean> {
  return true
}
