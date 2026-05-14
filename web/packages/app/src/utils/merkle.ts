// Pure merkle math for the depth-16 Poseidon2 member tree. Shared by the
// /commit and /verify pages so the leaf shape, root, and path always agree.
//
// Hash function matches ecdsa_validator's in-circuit Poseidon2:
//   leaf  = poseidon2([x_high, x_low, y_high, y_low])  // 16-byte BE chunks
//   inner = poseidon2([left, right])
//
// Every hash output is a BN254 Field element — naturally < modulus — so we
// represent leaves/path nodes/root as 0x-prefixed 32-byte hex strings (the
// shape Noir's ABI accepts for `Field` inputs).

import { bytesToHex, hexToBytes, type Hex } from 'viem'
import { poseidon2 } from './poseidon2'

export const TREE_DEPTH = 16
export const ZERO_FIELD: Hex = ('0x' + '00'.repeat(32)) as Hex

// Big-endian top 16 bytes of a 32-byte pubkey coord, left-padded to a Field.
function topHalfField(coord: Uint8Array): Hex {
  const out = new Uint8Array(32)
  out.set(coord.subarray(0, 16), 16)
  return bytesToHex(out)
}

// Big-endian bottom 16 bytes of a 32-byte pubkey coord, left-padded to a Field.
function bottomHalfField(coord: Uint8Array): Hex {
  const out = new Uint8Array(32)
  out.set(coord.subarray(16, 32), 16)
  return bytesToHex(out)
}

export async function leafFromPubkey(pkx: Hex, pky: Hex): Promise<Hex> {
  return leafFromPubkeyBytes(hexToBytes(pkx), hexToBytes(pky))
}

export async function leafFromPubkeyBytes(pkx: Uint8Array, pky: Uint8Array): Promise<Hex> {
  if (pkx.length !== 32 || pky.length !== 32) {
    throw new Error(`pubkey coords must be 32 bytes; got ${pkx.length}/${pky.length}`)
  }
  return poseidon2([topHalfField(pkx), bottomHalfField(pkx), topHalfField(pky), bottomHalfField(pky)])
}

// Pre-compute the all-zero subtree hash at each level. zeros[0] is the leaf
// zero; zeros[l] = poseidon2(zeros[l-1], zeros[l-1]).
export async function zeroSubtree(): Promise<Hex[]> {
  const zeros: Hex[] = [ZERO_FIELD]
  for (let l = 1; l < TREE_DEPTH; l++) {
    zeros.push(await poseidon2([zeros[l - 1], zeros[l - 1]]))
  }
  return zeros
}

export async function rootOfEmptyTree(): Promise<Hex> {
  const zeros = await zeroSubtree()
  const top = zeros[TREE_DEPTH - 1]
  return poseidon2([top, top])
}

// Build all DEPTH layers above the leaf layer with implicit zero-padding on
// missing right siblings. layers[0] is the supplied leaves; layers[l>0] is the
// hashed-pair layer above.
export async function buildLayers(leaves: Hex[], zeros: Hex[]): Promise<Hex[][]> {
  const layers: Hex[][] = [leaves.slice()]
  for (let l = 0; l < TREE_DEPTH; l++) {
    const cur = layers[l]
    const next: Hex[] = []
    const halfCount = Math.max(1, Math.ceil(cur.length / 2))
    for (let k = 0; k < halfCount; k++) {
      const left = cur[2 * k] ?? zeros[l]
      const right = cur[2 * k + 1] ?? zeros[l]
      next.push(await poseidon2([left, right]))
    }
    layers.push(next)
  }
  return layers
}

export async function computeRoot(leaves: Hex[]): Promise<Hex> {
  if (leaves.length === 0) return rootOfEmptyTree()
  const zeros = await zeroSubtree()
  const layers = await buildLayers(leaves, zeros)
  return layers[TREE_DEPTH][0]
}

export async function pathFor(
  leaves: Hex[],
  leafIndex: number,
): Promise<{ path: Hex[]; indices: boolean[] }> {
  if (leafIndex < 0 || leafIndex >= 1 << TREE_DEPTH) {
    throw new Error(`leaf_index ${leafIndex} out of range`)
  }
  const zeros = await zeroSubtree()
  const layers = await buildLayers(leaves, zeros)
  const path: Hex[] = []
  const indices: boolean[] = []
  let idx = leafIndex
  for (let l = 0; l < TREE_DEPTH; l++) {
    const layer = layers[l]
    const siblingIdx = idx ^ 1
    const sibling = layer[siblingIdx] ?? zeros[l]
    path.push(sibling)
    indices.push((idx & 1) === 1)
    idx = idx >> 1
  }
  return { path, indices }
}
