# Bordel Auth

Zero-knowledge membership proofs for a closed community.

A member enrolls an ECDSA secp256k1 public key — from a HaLo NFC chip or an EOA wallet — as a
commitment in a Merkle tree. Later, the member signs a fresh challenge and generates a Noir
zero-knowledge proof that **(a)** the signature is valid and **(b)** the signing key's leaf is in
the tree — without revealing the key or which member they are.

## The two-step model

The whole system is two flows:

1. **Create commitment** (`/commit`) — enroll a member. Read an ECDSA public key (HaLo tap, wallet
   signature, or raw pubkey paste), commit it as a Poseidon leaf, and recompute the Merkle root.
2. **Verify** (`/verify`) — prove membership. Sign a fresh EIP-712 challenge with the same key,
   generate the Noir proof (ECDSA + Merkle inclusion), and verify it.

The whole app is client-side: the membership tree is held in browser `localStorage` (key
`bordel-membership-tree-v1`), shared by both pages. There is no backend or database.

## Repository layout

| Path | What it is |
|------|------------|
| `web/` | Next.js app — the `/commit` and `/verify` UIs. Yarn workspace with a single package, `packages/app`. |
| `ecdsa_validator/` | The Noir circuit: ECDSA secp256k1 verification + Poseidon Merkle inclusion. |
| `bordel-eth-verifier/` | Foundry project — the generated UltraHonk Solidity verifier for on-chain proof checking. |
| `impl.md` | Design spec (the broader ZKAccess design this is a slice of). |
| `text.md` | Early approach notes. |

## Run the web app

Requires Node 20 and Yarn 1.

```bash
cd web
yarn install
yarn dev          # http://localhost:3000  — pages: / , /commit , /verify
```

Other scripts (run from `web/`):

```bash
yarn workspace app build   # production build
yarn workspace app lint
yarn workspace app test    # vitest
```

Quick end-to-end check: open `/commit`, enroll a key (paste mode is simplest), then open `/verify`
and sign with the same EOA wallet — you should see `[VALID]`.

## Run the circuit

Requires [Noir](https://noir-lang.org/) (`nargo`).

```bash
cd ecdsa_validator
nargo compile     # -> target/ecdsa_validator.json
nargo execute     # compile + generate a witness from Prover.toml
yarn build        # nargo compile && sync the artifact into web/packages/app
```

`yarn build` runs `scripts/sync_to_web.mjs`, which copies `target/ecdsa_validator.json` into the
web app and regenerates the TypeScript input type so the circuit and the app cannot drift.
`build_sample_tree.mjs` and `generate_proof.mjs` (repo-relative, in `ecdsa_validator/`) help build
a sample tree and generate/verify a proof off-chain with `bb.js`. See
[`ecdsa_validator/README.md`](ecdsa_validator/README.md) for details.

## Run the on-chain verifier

Requires [Foundry](https://book.getfoundry.sh/) (`forge`).

```bash
cd bordel-eth-verifier
forge build
forge test
```

## Verification model

A proof can be checked two ways:

- **In-browser** — what `/verify` does today: `@aztec/bb.js` verifies the UltraHonk proof
  client-side, no chain involved.
- **On-chain** — `bordel-eth-verifier/` holds the generated Solidity Honk verifier
  (`src/validators/EcdsaValidator.sol`) behind the `IVerifier` interface, for callers that need
  public, on-chain verification.

Both check the same circuit; the circuit artifact and the Solidity verifier are generated from the
same Noir source in `ecdsa_validator/`.

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | web, build-time | Reown/WalletConnect project ID. Without it the app falls back to injected-only wallets. Baked into the bundle at build time. |

That's the only one — the app is fully client-side, with no server-side state.

## Deployment

The web app deploys to Railway via `web/Dockerfile` (multi-stage, Next.js standalone output,
non-root, port 3000). See `railway.toml` for service settings. Nothing to persist — the member
tree lives in the browser.
