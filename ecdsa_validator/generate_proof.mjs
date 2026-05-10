// Generates and verifies a bordel membership proof using @aztec/bb.js.
//
// This is the canonical proof path for the Approach C gateway: the browser uses
// the same bb.js + UltraHonkBackend (default verifierTarget) to generate proofs,
// and the Next.js gateway uses the same to verify. The bb CLI's `bb prove -t evm`
// path produces a Solidity-targeted proof that bb.js cannot verify; we don't use
// it because we never verify on-chain.
//
// Pipeline:
//   1. node build_sample_tree.mjs  → Prover.toml
//   2. nargo execute               → target/ecdsa_validator.gz (witness)
//   3. node generate_proof.mjs     → target/bbjs_proof.bin
//                                  → target/bbjs_public_inputs.json
//
// This script also self-verifies the proof as a sanity check; exits non-zero if
// verification fails.

import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { readFileSync, writeFileSync } from "node:fs";

const circuit = JSON.parse(readFileSync("./target/ecdsa_validator.json", "utf8"));
const witness = new Uint8Array(readFileSync("./target/ecdsa_validator.gz"));

const bb = await Barretenberg.new();
const backend = new UltraHonkBackend(circuit.bytecode, bb);

const t0 = Date.now();
const { proof, publicInputs } = await backend.generateProof(witness);
const t1 = Date.now();
console.log(
  `Generated proof in ${t1 - t0} ms: ` +
  `${proof.byteLength}B over ${publicInputs.length} public inputs.`,
);

const ok = await backend.verifyProof({ proof, publicInputs });
console.log(`Verify: ${ok ? "OK" : "FAIL"}`);
if (!ok) {
  await bb.destroy();
  process.exit(1);
}

writeFileSync("./target/bbjs_proof.bin", proof);
writeFileSync(
  "./target/bbjs_public_inputs.json",
  JSON.stringify(publicInputs, null, 2),
);
console.log(
  "Wrote target/bbjs_proof.bin and target/bbjs_public_inputs.json",
);

await bb.destroy();
