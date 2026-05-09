import { keccak256, hexToBytes, concat as bytesConcat } from "viem";
import { writeFileSync } from "node:fs";

// Hardcoded test wallet (matches the original ecdsa_validator README).
// pubkey + signature pair was generated against the challenge below.
const PUBKEY_X = "0x533367042c3e9456fec155940165c28c01fe6e28601337df50562ddc4f36bfb9";
const PUBKEY_Y = "0x7dcafe27cadbe10861bb67e0599382f79dc29c1d39d93b10f716c8ceff1743ed";
const CHALLENGE = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8";
// 64 bytes (r || s); the v byte is dropped — the circuit doesn't use it.
const SIG = "0xdd935f778351217ec02e6f857e47f0cea837380f30eccf63742b9a97cf1872b4316700b028504591f6b31203b86ccb3363353eedd8f9cf4f344a769c689525b3";

const DEPTH = 16;
const ZERO_LEAF_HEX = ("0x" + "00".repeat(32));

const leaf = keccak256(bytesConcat([hexToBytes(PUBKEY_X), hexToBytes(PUBKEY_Y)]));

// Pre-compute the zero-subtree hash at each level. zeroSubtree[0] is the leaf-level
// zero (32 bytes of 0x00). zeroSubtree[L] = keccak(zeroSubtree[L-1] || zeroSubtree[L-1]).
const zeroSubtree = [ZERO_LEAF_HEX];
for (let l = 1; l < DEPTH; l++) {
  const prev = hexToBytes(zeroSubtree[l - 1]);
  zeroSubtree.push(keccak256(bytesConcat([prev, prev])));
}

// Member is at leaf index 0. At every level the current node is the LEFT child,
// so the path entries are the zero-subtree hashes and indices are all `false`.
const path = [];
const indices = [];
let cur = leaf;
for (let level = 0; level < DEPTH; level++) {
  const sibling = zeroSubtree[level];
  path.push(sibling);
  indices.push(false);
  cur = keccak256(bytesConcat([hexToBytes(cur), hexToBytes(sibling)]));
}
const root = cur;

// TOML serialization helpers
const bytesArrayToToml = (hex) =>
  "[" + Array.from(hexToBytes(hex)).map((b) => b.toString()).join(", ") + "]";
const pathToToml = (paths) =>
  paths.map((p) => "  " + bytesArrayToToml(p)).join(",\n");
const indicesToToml = (idx) =>
  "[" + idx.map((b) => (b ? "true" : "false")).join(", ") + "]";

const toml = `pub_key_x = ${bytesArrayToToml(PUBKEY_X)}
pub_key_y = ${bytesArrayToToml(PUBKEY_Y)}
signature = ${bytesArrayToToml(SIG)}
challenge = ${bytesArrayToToml(CHALLENGE)}
root = ${bytesArrayToToml(root)}
leaf = ${bytesArrayToToml(leaf)}
merkle_path = [
${pathToToml(path)}
]
merkle_indices = ${indicesToToml(indices)}
`;

writeFileSync("Prover.toml", toml);
console.log(`Wrote Prover.toml. Member leaf=${leaf}, root=${root}`);
