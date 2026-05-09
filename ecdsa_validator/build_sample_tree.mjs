import { BarretenbergSync } from "@aztec/bb.js";
import { hexToBytes } from "viem";
import { writeFileSync } from "node:fs";

const PUBKEY_X = "0x533367042c3e9456fec155940165c28c01fe6e28601337df50562ddc4f36bfb9";
const PUBKEY_Y = "0x7dcafe27cadbe10861bb67e0599382f79dc29c1d39d93b10f716c8ceff1743ed";
const CHALLENGE = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8";
// 64 bytes (r || s); the v byte is dropped -- the circuit doesn't use it.
const SIG = "0xdd935f778351217ec02e6f857e47f0cea837380f30eccf63742b9a97cf1872b4316700b028504591f6b31203b86ccb3363353eedd8f9cf4f344a769c689525b3";

const DEPTH = 16;

// Initialize synchronous Barretenberg WASM
const bb = await BarretenbergSync.initSingleton();

// --- Field helpers ---

// Convert a 32-byte big-endian Uint8Array into a 32-byte BE Fr buffer.
// Validates it fits in BN254 field (16 bytes always fits trivially).
function bytesToFrBuffer(bytes32) {
  if (bytes32.length !== 32) throw new Error("expected 32 bytes");
  return bytes32;
}

// High 16 bytes of a 32-byte array, zero-padded to 32 bytes (BE).
function highHalfToFr(bytes32) {
  const out = new Uint8Array(32);
  out.set(bytes32.slice(0, 16), 16); // put 16 bytes into the low half
  return out;
}

// Low 16 bytes of a 32-byte array, zero-padded to 32 bytes (BE).
function lowHalfToFr(bytes32) {
  const out = new Uint8Array(32);
  out.set(bytes32.slice(16, 32), 16); // put 16 bytes into the low half
  return out;
}

// poseidon2Hash returns a Uint8Array (32 bytes) synchronously.
function p2hash(frBuffers) {
  const result = bb.poseidon2Hash({ inputs: frBuffers });
  // result is { hash: Uint8Array }
  return result.hash;
}

function frToHex(buf) {
  return "0x" + Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- 1. Compute leaf = poseidon2([x_high, x_low, y_high, y_low]) ---
const xBytes = hexToBytes(PUBKEY_X);
const yBytes = hexToBytes(PUBKEY_Y);

const xHigh = highHalfToFr(xBytes);
const xLow  = lowHalfToFr(xBytes);
const yHigh = highHalfToFr(yBytes);
const yLow  = lowHalfToFr(yBytes);

const leafBuf = p2hash([xHigh, xLow, yHigh, yLow]);
const leafHex = frToHex(leafBuf);

// --- 2. Build sparse depth-16 tree with leaf at index 0 ---
const ZERO_FIELD = new Uint8Array(32); // all-zero field element
const zeroSubtree = [ZERO_FIELD];
for (let l = 1; l < DEPTH; l++) {
  zeroSubtree.push(p2hash([zeroSubtree[l - 1], zeroSubtree[l - 1]]));
}

const path = [];
const indices = [];
let curBuf = leafBuf;
for (let level = 0; level < DEPTH; level++) {
  const sibling = zeroSubtree[level];
  path.push(sibling);
  indices.push(false); // leaf at index 0: always left child
  curBuf = p2hash([curBuf, sibling]);
}
const rootHex = frToHex(curBuf);

// --- 3. Serialize Prover.toml ---
const bytesArrayToToml = (hex) =>
  "[" + Array.from(hexToBytes(hex)).map(b => b.toString()).join(", ") + "]";

// Fields for Noir: quoted hex strings
const fieldToToml = (buf) => `"${frToHex(buf)}"`;

const pathToToml = (paths) =>
  paths.map(p => "  " + fieldToToml(p)).join(",\n");

const indicesToToml = (idx) =>
  "[" + idx.map(b => (b ? "true" : "false")).join(", ") + "]";

const toml = `pub_key_x = ${bytesArrayToToml(PUBKEY_X)}
pub_key_y = ${bytesArrayToToml(PUBKEY_Y)}
signature = ${bytesArrayToToml(SIG)}
challenge = ${bytesArrayToToml(CHALLENGE)}
root = "${rootHex}"
leaf = "${leafHex}"
merkle_path = [
${pathToToml(path)}
]
merkle_indices = ${indicesToToml(indices)}
`;

writeFileSync("Prover.toml", toml);
console.log(`Wrote Prover.toml. leaf=${leafHex}, root=${rootHex}`);
