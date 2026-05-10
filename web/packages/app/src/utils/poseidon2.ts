// Poseidon2 hash helper backed by @aztec/bb.js's BarretenbergSync. Used by the
// merkle utilities so the TS-side leaf and root computations stay byte-identical
// with the in-circuit Poseidon2::hash from ecdsa_validator.
//
// Works in both Node.js (server) and browser (client) thanks to bb.js's WASM
// fallback. The instance is initialized lazily on first call and cached.

import { bytesToHex, hexToBytes, type Hex } from 'viem'
import { BarretenbergSync } from '@aztec/bb.js'

let instance: BarretenbergSync | null = null
let initPromise: Promise<BarretenbergSync> | null = null

async function getBb(): Promise<BarretenbergSync> {
  if (instance) return instance
  if (!initPromise) initPromise = BarretenbergSync.new()
  instance = await initPromise
  return instance
}

// Normalize any 0x-prefixed hex (with or without leading zeros) to 32 BE bytes.
// Throws if the value is wider than 32 bytes; values >= BN254 modulus are not
// rejected here — bb.js will reduce them, but in practice every input we feed
// in is already either the output of poseidon2 (a Field) or a 16-byte chunk.
export function fieldHexToBytes(field: Hex): Uint8Array {
  const cleaned = field.startsWith('0x') ? field.slice(2) : field
  if (cleaned.length > 64) {
    throw new Error(`field hex too long (${cleaned.length} chars, max 64)`)
  }
  const padded = cleaned.padStart(64, '0')
  return hexToBytes(('0x' + padded) as Hex)
}

export async function poseidon2(fields: Hex[]): Promise<Hex> {
  const bb = await getBb()
  const inputs = fields.map(fieldHexToBytes)
  const { hash } = bb.poseidon2Hash({ inputs })
  return bytesToHex(hash)
}
