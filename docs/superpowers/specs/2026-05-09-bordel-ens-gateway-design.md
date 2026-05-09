# Bordel ENS Gateway — Design Spec

**Date:** 2026-05-09
**Status:** Approved (sections 1–4)
**Scope:** MVP on Sepolia. No NFT. No guest passes. No nullifiers. Approach C (bounded gateway trust).

## 1. Problem statement

Bordel issues membership credentials. The existing system uses an ERC-721 NFT plus two parallel proof paths: an ECDSA zk-circuit (`ecdsa_validator`) that proves wallet control without revealing the pubkey, and vlayer storage proofs (`eth-proofs`, `bordel-eth-verifier`) that prove NFT ownership at a recent block.

We want member identity and access checks to be expressible as ENS subnames, so that:

- The bordel-gate contract can ask `resolver.addr(door.skas.bordel.eth)` and receive `skas`'s wallet address iff `skas` currently has access to the door.
- Door / kitchen / freezer permissions are individual capability subnames that can be added or restricted by config without touching contracts.
- A revocation propagates instantly across all gates and capabilities.
- The system survives gateway compromise: a stolen signer key cannot grant access for more than a short time window and cannot survive a single admin tx.

## 2. Decisions

- **Architecture:** Approach C — gateway verifies the zk-proof off-chain and signs a structured receipt; the on-chain `BordelResolver` checks the gateway signature, freshness, and current member-set root.
- **Membership artifact:** Merkle tree of pubkeys. NFT removed.
- **Leaf shape:** `keccak256(pub_key_x ‖ pub_key_y)`.
- **Subname issuance:** virtual via gateway only. No on-chain subname mints.
- **Resolver state:** stored as ENS text records on `bordel.eth` itself. No separate `MemberRegistry` contract.
- **Gateway runtime:** Next.js API routes inside `web/packages/app/src/app/api/gateway/...`.
- **Chain placement:** Sepolia for MVP (ENSv2 contracts deployed there). Mainnet migration is a redeploy + re-registration; protocol unchanged.
- **Resolver interface:** ENSv1-compatible. `addr(60)` returns the member address if access is valid, `address(0)` otherwise.

## 3. Architecture

### 3.1 Components

| Component | New / existing | Location | Purpose |
|-----------|----------------|----------|---------|
| `BordelResolver` | new | Solidity, deployed on Sepolia | ENS resolver for `bordel.eth` and `*.bordel.eth`. Dual-mode: standard text records for the parent, CCIP-Read flow for subnames. |
| Gateway | new | Next.js API routes in `web/packages/app/src/app/api/gateway/` | Off-chain HTTPS service. Holds member DB, runs Noir verifier server-side, signs receipts. |
| Circuit (`ecdsa_validator` v2) | extended | `ecdsa_validator/src/main.nr` | Adds Merkle inclusion to the existing ECDSA verification. |
| Wallet/dApp | extended | `web/packages/app/src/...` | Generates challenge, signs with member key, runs circuit via existing `noir.ts`, completes the CCIP-Read flow. |
| Bordel gate contract(s) | downstream consumers | various | Read `resolver.addr(door.skas.bordel.eth)` to gate physical or onchain access. Out of scope for this spec. |

### 3.2 What goes away

- `web/packages/hardhat/contracts/NFT.sol` — no longer the membership artifact.
- `bordel-eth-verifier/` — vlayer storage-proof path; not used in this design. May be repurposed if we ever upgrade to Approach B (on-chain proof verification).
- `eth-proofs/` — same. Set aside, not deleted.

### 3.3 Resolver dual mode

`BordelResolver` is the resolver for both `bordel.eth` and its subnames. ENSv2's longest-suffix-match resolution sends both kinds of queries to the same contract.

| Query target | Mode | Storage |
|--------------|------|---------|
| `bordel.eth` itself | Standard ERC-634 / ERC-7884 text-record resolver. Admin writes via `setText()` from any ENS-aware UI. | On-chain mapping `node → key → string` inside the resolver. |
| `*.bordel.eth` (subnames) | CCIP-Read. `resolve()` reverts with `OffchainLookup`; the wallet posts the proof to the gateway; the gateway returns a signed receipt; `resolveWithProof()` verifies. | None on-chain. Gateway DB is authoritative. |

### 3.4 Parent-level parameters (text records on `bordel.eth`)

| Key | Encoding | Meaning |
|-----|----------|---------|
| `bordel.member-root` | `0x`-prefixed 32-byte hex string | Current Merkle root of member set. |
| `bordel.gateway-signer` | `0x`-prefixed 20-byte hex string | EOA the resolver trusts for receipt sigs. |
| `bordel.freshness-window` | decimal uint, base-10 string | Max blocks between `signed_blockNum` and `block.number`. |
| `bordel.capabilities` | comma-separated lowercase tokens | Globally known capability names (`door,freezer,kitchen`). Informational; gateway is still authoritative for who has what. |

Default `freshness-window` is `30` blocks. Hard upper bound is 256 (limit imposed by `blockhash()`).

### 3.5 Per-member virtual records

Returned by the gateway via CCIP-Read on `<name>.bordel.eth`. Same receipt format as `addr()`, payload type differs.

| Key | Type | Meaning |
|-----|------|---------|
| `bordel.expires` | decimal uint | Optional per-member expiry block. |
| `bordel.tier` | string | `core`, `member`, etc. |
| `bordel.capabilities` | csv | Capabilities the member has. |
| `avatar`, `email`, … | standard ENS keys | Pass-through from gateway DB. |

## 4. Protocol

### 4.1 Circuit (`ecdsa_validator` v2)

```
PRIVATE INPUTS
  pub_key_x      : [u8; 32]
  pub_key_y      : [u8; 32]
  signature      : [u8; 64]
  merkle_path    : [Field; DEPTH]
  merkle_indices : [u1; DEPTH]   # bit per level

PUBLIC INPUTS
  challenge      : [u8; 32]      # = keccak256("BORDEL_AUTH_V1" ‖ nonce ‖ node)
  root           : Field
  leaf           : Field         # = keccak256(pub_key_x ‖ pub_key_y)

ASSERTIONS
  1. verify_signature(pub_key_x, pub_key_y, signature, challenge) == true
  2. compute_leaf(pub_key_x, pub_key_y) == leaf
  3. merkle_verify(leaf, merkle_path, merkle_indices, root) == true
```

`DEPTH = 16` (supports up to 65 536 members).

### 4.2 Gateway request/response

```
POST /api/gateway/lookup
{
  "name":         "door.skas.bordel.eth",
  "node":         "0x...32 bytes namehash",
  "selector":     "0x3b3b57de",          # addr(bytes32) or text(bytes32,string)
  "selectorArgs": [],                     # optional, for text records: ["bordel.tier"]
  "proof":        "0x...",                # Noir proof bytes
  "publicInputs": {
    "challenge":  "0x...32 bytes",
    "root":       "0x...32 bytes",
    "leaf":       "0x...32 bytes"
  }
}
```

```
200 OK
{
  "receipt":   "0x...abi.encode(node, value, signed_root, blockNum, blockHash)",
  "signature": "0x...65 bytes ecdsa"
}

400 / 403 / 404 — empty payload; resolver returns address(0) / empty string.
```

### 4.3 Receipt schema (ABI)

```solidity
struct Receipt {
    bytes32 node;          // namehash of the queried name
    bytes   value;          // abi-encoded record value (address for addr, string for text, …)
    bytes32 signedRoot;    // Merkle root the proof was made against
    uint64  blockNum;
    bytes32 blockHash;
}
```

`receipt = abi.encode(Receipt)`. Signed digest is `keccak256(receipt)` with EIP-191 prefix.

### 4.4 Happy-path flow

```
1. Wallet picks nonce = random(32).

2. Wallet computes challenge = keccak256("BORDEL_AUTH_V1" ‖ nonce ‖ node).

3. Wallet signs challenge with member secp256k1 key, generates Noir proof
   via web/packages/app/src/utils/noir.ts.

4. Wallet calls BordelResolver.resolve(dnsName, callData):
       reverts with OffchainLookup(sender, [gatewayUrl], callData,
                                   resolveWithProof, extraData=node).

5. viem 2.35+ transparently POSTs to /api/gateway/lookup.

6. Gateway:
   a) verifyNoirProof(proof, publicInputs) — UltraHonk verify, server-side.
   b) lookup db: parent = parse_parent(name) → expected_leaf, member_addr, capabilities.
   c) require publicInputs.leaf == expected_leaf.                   # name binding
   d) require publicInputs.root == onchain_text("bordel.member-root").  # not stale
   e) require capability_of(name) ∈ capabilities.                   # door allowed
   f) signed_blockNum  = current_block - 1
      signed_blockHash = blockhash(signed_blockNum)
   g) receipt = abi.encode(Receipt{node, abi.encode(member_addr), root, blockNum, blockHash}).
   h) signature = sign(gatewaySignerKey, eip191(keccak256(receipt))).

7. Gateway returns (receipt, signature).

8. resolveWithProof(response, extraData):
   a) (receipt, sig) = abi.decode(response).
   b) require ecrecover(eip191(keccak256(receipt)), sig) == _signer().
   c) require Receipt.node == extraData.
   d) require Receipt.signedRoot == _root().
   e) require block.number - Receipt.blockNum < _freshness().
   f) if Receipt.blockNum > block.number - 256:
        require blockhash(Receipt.blockNum) == Receipt.blockHash.
   g) return Receipt.value.

9. Wallet calls gate.openDoor(node, response):
       result = resolver.resolveWithProof(response, abi.encode(node));
       address granted = abi.decode(result, (address));
       require(granted == msg.sender);
       // open the door
```

### 4.5 Caching

Wallets cache `(receipt, signature)` in `sessionStorage` keyed by `node`. Subsequent calls within the freshness window reuse it. After expiry, regenerate the proof.

The gateway is stateless across requests; no cache.

## 5. Invariants

| # | Invariant | Enforced by |
|---|-----------|-------------|
| I1 | A receipt is valid only against the root it was signed under. | resolveWithProof step 8.d |
| I2 | A receipt is valid only inside the freshness window. | resolveWithProof step 8.e |
| I3 | A receipt cannot be reused for a different name. | resolveWithProof step 8.c |
| I4 | A receipt cannot be reused for a different record key. | `Receipt.value` is opaque per-record; gateway signs a distinct receipt per query. |
| I5 | A proof cannot be reused for a different member's name. | Gateway step 6.c |
| I6 | A proof cannot be reused for a capability the member lacks. | Gateway step 6.e |
| I7 | A reorged signed-block invalidates the receipt. | resolveWithProof step 8.f |
| I8 | A rotated signer key invalidates outstanding receipts. | resolveWithProof step 8.b reads `_signer()` live. |
| I9 | A rotated member-root invalidates outstanding receipts. | resolveWithProof step 8.d reads `_root()` live. |

## 6. Failure modes

### 6.1 Adversarial

| Threat | Outcome |
|--------|---------|
| Replay (old block) | Rejected by I2. |
| Replay (different node) | Rejected by I3. |
| Replay (after revocation) | Rejected by I9 once admin rotates root. |
| Cross-member replay | Rejected by I5. |
| Cross-capability replay | Rejected by I6 at gateway; I3 on chain. |
| Reorg | Rejected by I7. |
| Gateway signer compromise | Bounded to freshness window; admin rotates `bordel.gateway-signer` (one tx) to kill remaining receipts. |
| Member key compromise | Admin rebuilds tree without leaf; sets new `bordel.member-root`. |
| Onchain replay of someone else's receipt | Gate's `require(granted == msg.sender)` rejects. |

### 6.2 Negative cases (non-malicious)

| Case | Resolver returns |
|------|------------------|
| Lookup of non-member | `address(0)` (gateway returns 4xx, resolver decodes empty). |
| Member exists, lacks the capability | `address(0)`. |
| Lookup of `bordel.eth` itself | Whatever its on-chain `addr()` text record holds. |
| Unknown record key | Empty string / zero. |
| Gateway down | Resolution fails (revert). UIs treat as failure. |
| Unset parameter text record | Resolver reverts with `BordelResolver: parameter missing`. |

## 7. Recovery / rotation playbook

| Operation | Action | Effect |
|-----------|--------|--------|
| Rotate gateway signer | `setText(BORDEL_NODE, "bordel.gateway-signer", newAddr)` | Instant. Old receipts fail I8. |
| Revoke a member | Rebuild tree without leaf → `setText(BORDEL_NODE, "bordel.member-root", newRoot)` | Instant. I9. |
| Add a member | Rebuild tree with new leaf → `setText(BORDEL_NODE, "bordel.member-root", newRoot)`; update gateway DB. | Instant. |
| Mass migration | Same as revoke — publish new root. | Instant. |
| Sepolia → mainnet | Redeploy `BordelResolver` on mainnet; populate parent text records; point gateway at mainnet RPC. | Manual one-time migration. |

## 8. Out of scope

- Approach B (on-chain SNARK verification per lookup) — hooks are present in the data shape but not wired.
- Single-use guest passes / nullifiers.
- ENSv2 cross-chain L2 resolution (namechain) — Sepolia-direct in MVP.
- Mainnet deployment — protocol-identical, but operational migration, naming, multisig setup are tracked separately.
- Reverse resolution (`addr.reverse → name`).
- ERC-1155 onchain subnames.

## 9. Testing

### 9.1 Circuit (Noir)

- Valid sig + valid path + matching root → witness OK.
- Valid sig + bad path → assertion failure.
- Wrong pubkey for sig → ECDSA verify fails.
- `leaf == keccak(pub_key_x ‖ pub_key_y)` — fuzz across 100 generated keys.
- Tree depth = 16 — boundary cases (root-only, full tree).

### 9.2 Resolver (Forge, `web/packages/foundry`)

- `resolveWithProof` happy path returns member_addr.
- Stale root (post-rotation) reverts.
- Stale block (> freshness window) reverts.
- Wrong signer reverts.
- Tampered receipt (each field flipped) reverts.
- Blockhash mismatch reverts.
- Node mismatch between extraData and receipt reverts.
- `setText` / read round-trip for all four parent params.
- `resolve()` of `bordel.eth` returns `addr()` directly.
- `resolve()` of `*.bordel.eth` reverts with `OffchainLookup`.
- Unknown / unset parameter text record reverts with explicit error.
- Rotating member-root mid-flight invalidates prior receipts.
- Rotating gateway-signer mid-flight invalidates prior receipts.
- Access control: only `bordel.eth` owner can `setText` parent params.

### 9.3 Gateway (Vitest, Next.js API route handlers)

- POST `/api/gateway/lookup` valid proof → signed receipt.
- Proof verification fails → 400, no receipt.
- Leaf mismatch → 403.
- `publicInputs.root` differs from on-chain root → 403.
- Name not in DB → 404.
- Name lacks requested capability → 403.
- Signer rotation: gateway picks up new config without restart.
- DB read-your-own-write across concurrent admin updates.
- Per-IP and per-name rate limits.

### 9.4 End-to-end (Playwright on Sepolia)

- Member: connect → generate proof → `resolver.addr(door.skas.bordel.eth)` returns wallet.
- Member: `gate.openDoor()` with cached receipt → succeeds.
- Non-member: `addr === 0x0` → `openDoor` reverts.
- Member after revocation: `addr === 0x0`.
- Member with cached receipt past freshness: `resolveWithProof` reverts → wallet auto-regens.

## 10. Repository layout

```
bordel-auth/
├── ecdsa_validator/              # Noir circuit, extended with Merkle inclusion
│   └── src/main.nr
├── web/
│   └── packages/
│       ├── foundry/              # Forge — BordelResolver lives here
│       │   ├── src/BordelResolver.sol
│       │   ├── script/Deploy.s.sol
│       │   └── test/BordelResolver.t.sol
│       └── app/                  # Next.js — gateway + dApp
│           └── src/
│               ├── app/api/gateway/
│               │   ├── lookup/route.ts
│               │   └── _lib/
│               │       ├── verify.ts        # server-side Noir verify
│               │       ├── sign.ts          # receipt signing
│               │       ├── db.ts            # member DB
│               │       └── chain.ts         # read parent text records
│               ├── utils/noir.ts            # existing, extended for new public inputs
│               └── app/door/page.tsx        # demo page that drives a gate
└── docs/superpowers/specs/2026-05-09-bordel-ens-gateway-design.md   # this doc
```

## 11. Open items deferred to implementation plan

- Concrete `BordelResolver` Solidity layout, error types, gas budget.
- **Leaf and tree hash function** — keccak (cheap on-chain, expensive in-circuit) vs Poseidon/Pedersen (cheap in-circuit, requires on-chain implementation if ever used in Approach B). MVP uses gateway-side verification only, so any choice is acceptable for v1; recommend Poseidon for circuit efficiency unless it complicates leaf construction outside the circuit.
- **Receipt signing scheme** — EIP-191 (simple) vs EIP-712 (typed, clearer for wallet UIs that may sign manually for ops/debug). Default to EIP-712 if it doesn't bloat gateway code.
- Member DB schema and seeding script.
- Gateway signer key management (env var, KMS, etc.).
- Production deployment story (Vercel? Self-host?).
- Frontend UX for first-time member onboarding (proof gen progress, caching).
- Sepolia ENSv2 contract addresses and registration steps.
