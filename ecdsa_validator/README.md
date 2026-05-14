# ecdsa_validator

The Noir circuit behind Bordel Auth. It proves, in zero knowledge, that the prover controls an
ECDSA secp256k1 key whose commitment is a leaf in a published Merkle tree — without revealing the
key or which leaf it is.

## What it proves

```
PRIVATE
  pub_key_x      [u8; 32]          secp256k1 public key X
  pub_key_y      [u8; 32]          secp256k1 public key Y
  signature      [u8; 64]          r ‖ s over `challenge`, low-s normalized
  merkle_path    [Field; 16]       sibling hashes
  merkle_indices [bool; 16]        path direction bits

PUBLIC
  challenge      [u8; 32]          the 32-byte digest that was signed
  root           Field            Merkle root of the member set
  leaf           Field            the prover's leaf

ASSERTIONS  (see src/main.nr)
  1. verify_signature(pub_key_x, pub_key_y, signature, challenge)
  2. leaf == poseidon2([x_high, x_low, y_high, y_low])   — each 32-byte coord
     split into a high-16 / low-16 chunk so it fits in a BN254 Field
  3. verify_inclusion(leaf, merkle_path, merkle_indices, root)   — src/merkle.nr
```

`TREE_DEPTH` is 16 (up to 65 536 members). Proving system is UltraHonk.

## Layout

| Path | What it is |
|------|------------|
| `src/main.nr` | Circuit entrypoint — the three assertions above. |
| `src/merkle.nr` | Poseidon2 Merkle inclusion verifier. |
| `Prover.toml` | Witness inputs for `nargo execute`. |
| `scripts/sync_to_web.mjs` | Copies the compiled circuit into `web/packages/app` and regenerates its TS input type. |
| `build_sample_tree.mjs` | Builds a sample Merkle tree and writes a matching `Prover.toml`. |
| `generate_proof.mjs` | Generates and verifies a proof off-chain with `@aztec/bb.js`. |

## Build

Requires [Noir](https://noir-lang.org/) (`nargo`) and `bb` for verifier-contract generation.

```bash
nargo compile        # -> target/ecdsa_validator.json
nargo execute        # compile + generate a witness from Prover.toml

yarn install
yarn build           # nargo compile && sync the artifact into web/packages/app
yarn sync            # just sync (after a manual nargo compile)
```

## Generate a proof off-chain

```bash
node build_sample_tree.mjs    # writes a sample Prover.toml
nargo execute                 # -> target/ecdsa_validator.gz (witness)
node generate_proof.mjs       # UltraHonk prove + verify via bb.js
                              # -> target/bbjs_proof.bin, target/bbjs_public_inputs.json
```

## Generate the on-chain verifier

```bash
bb write_vk --oracle_hash keccak -b ./target/ecdsa_validator.json -o ./target
bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol
```

The committed Foundry copy of the verifier lives in `bordel-eth-verifier/`.
