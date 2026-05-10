// Pure merkle math for the depth-16 keccak member tree. Dual-environment:
// imported by both src/server/membership.ts (server) and the prove page
// (client) so the leaf shape, root, and path can never disagree between sides.
//
// Dependency budget: viem only.

import { bytesToHex, concat as bytesConcat, hexToBytes, keccak256, type Hex } from 'viem'

export const TREE_DEPTH = 16
export const ZERO_BYTES32: Hex = ('0x' + '00'.repeat(32)) as Hex

export function leafFromPubkey(pkx: Hex, pky: Hex): Hex {
  return keccak256(bytesConcat([hexToBytes(pkx), hexToBytes(pky)]))
}

export function leafFromPubkeyBytes(pkx: Uint8Array, pky: Uint8Array): Hex {
  return keccak256(bytesConcat([pkx, pky]))
}

// Pre-compute the all-zero subtree hash at each level. zeros[0] is the leaf
// zero; zeros[l] = keccak(zeros[l-1] || zeros[l-1]).
export function zeroSubtree(): Hex[] {
  const zeros: Hex[] = [ZERO_BYTES32]
  for (let l = 1; l < TREE_DEPTH; l++) {
    const prev = hexToBytes(zeros[l - 1])
    zeros.push(keccak256(bytesConcat([prev, prev])))
  }
  return zeros
}

export function rootOfEmptyTree(): Hex {
  const zeros = zeroSubtree()
  const top = hexToBytes(zeros[TREE_DEPTH - 1])
  return keccak256(bytesConcat([top, top]))
}

// Build all DEPTH layers above the leaf layer with implicit zero-padding on
// missing right siblings. layers[0] is the supplied leaves; layers[l>0] is the
// hashed-pair layer above.
export function buildLayers(leaves: Hex[], zeros: Hex[]): Hex[][] {
  const layers: Hex[][] = [leaves.slice()]
  for (let l = 0; l < TREE_DEPTH; l++) {
    const cur = layers[l]
    const next: Hex[] = []
    const halfCount = Math.max(1, Math.ceil(cur.length / 2))
    for (let k = 0; k < halfCount; k++) {
      const left = cur[2 * k] ?? zeros[l]
      const right = cur[2 * k + 1] ?? zeros[l]
      next.push(keccak256(bytesConcat([hexToBytes(left), hexToBytes(right)])))
    }
    layers.push(next)
  }
  return layers
}

export function computeRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) return rootOfEmptyTree()
  const zeros = zeroSubtree()
  const layers = buildLayers(leaves, zeros)
  return layers[TREE_DEPTH][0]
}

export function pathFor(
  leaves: Hex[],
  leafIndex: number,
): { path: Hex[]; indices: boolean[] } {
  if (leafIndex < 0 || leafIndex >= 1 << TREE_DEPTH) {
    throw new Error(`leaf_index ${leafIndex} out of range`)
  }
  const zeros = zeroSubtree()
  const layers = buildLayers(leaves, zeros)
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

// Tiny re-export so callers don't need a separate viem import for the common
// "leaf as bytes for the circuit" conversion.
export { bytesToHex, hexToBytes }
