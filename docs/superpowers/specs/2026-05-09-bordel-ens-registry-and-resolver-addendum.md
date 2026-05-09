# Bordel ENS Registry & Off-chain Resolver — Addendum

**Date:** 2026-05-09
**Status:** Approved (sections 1–4)
**Extends:** `2026-05-09-bordel-ens-gateway-design.md`
**Scope:** ENSv2 registry of basic properties + off-chain resolver behavior. Pinpoints sections 3.4, 3.5, 4.x, 5, 6, 9 of the parent spec.

## 1. Purpose

The parent spec leaves the registry of on-chain parameters thin (four text records) and the off-chain resolver behavior under-specified at the ENS-level. This addendum:

- Extends the registry with the parameters needed for runtime rotation of gateway URLs and the challenge domain tag.
- Pins down the resolver's public surface, dispatch logic, and live-config reads.
- Updates the gateway / wallet protocol to consume the new parameters.
- Adds the invariants, failure modes, and tests that follow.

What this addendum does **not** change: the receipt schema (parent spec §4.3), the rotation playbook (§7), the trust model, the leaf shape, or the circuit. The hash function and tree depth stay compile-time in the circuit and gateway code; they are deliberately not in the on-chain registry.

## 2. Extended registry schema

The "registry of basic properties" is the set of text records on `bordel.eth`, read by either the resolver, the gateway, or the wallet.

| Key | Encoding | Required? | Default if unset | Read by |
|-----|----------|-----------|------------------|---------|
| `bordel.member-root` | `0x`-prefixed 32-byte hex | **required** | resolver reverts `ParameterMissing("member-root")` | resolver, gateway |
| `bordel.gateway-signer` | `0x`-prefixed 20-byte hex | **required** | resolver reverts `ParameterMissing("gateway-signer")` | resolver |
| `bordel.freshness-window` | decimal uint, base-10 string | optional | `30`; capped at `256` | resolver |
| `bordel.capabilities` | csv lowercase tokens | optional (informational) | empty list | clients only |
| `bordel.gateway-url.N` | URL string, `N` ∈ {`0`, `1`, …} contiguous | **at least one required** | resolver reverts `NoGatewayConfigured` on subname resolve | resolver |
| `bordel.challenge-domain` | UTF-8 string, max 32 bytes (sanity bound; bytes, not codepoints) | optional | hardcoded `"BORDEL_AUTH_V1"` in gateway + wallet | gateway, wallet |

### 2.1 Notes

- **Required vs optional.** "Required" = subname resolution fails closed if missing. "Optional" = silent fallback to the listed default.
- **`bordel.gateway-url.N` iteration.** The resolver reads `text(BORDEL_NODE, "bordel.gateway-url.0")`, then `.1`, etc. The first empty string ends the list. Admins must keep the index contiguous; gaps are silently treated as the end of the list.
- **`bordel.challenge-domain` discovery.** The resolver does not read this key. Wallets discover it via standard `text(BORDEL_NODE, "bordel.challenge-domain")` — no out-of-band config sharing. The gateway reads it on each request (no in-memory cache).
- **Mutation.** All keys are written by the `bordel.eth` ENS owner via standard `setText`. Effect is instant (next block).
- **Out of registry.** Hash function (keccak256), tree depth (16), and verifying key are pinned in code. Rotating any of them is a circuit version bump, not a config change.

## 3. Resolver behavior

The resolver is one contract, set as the resolver record for `bordel.eth`. ENSv2 wildcard resolution (ENSIP-10) routes `*.bordel.eth` queries to it as well.

### 3.1 Public surface

```solidity
// ENS standard (parent only, in practice)
function addr(bytes32 node) external view returns (address);
function text(bytes32 node, string calldata key) external view returns (string memory);
function setText(bytes32 node, string calldata key, string calldata value) external;

// ENSIP-10 wildcard (parent + subnames)
function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);

// CCIP-Read callback
function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns (bytes memory);

function supportsInterface(bytes4 id) external view returns (bool);
```

`setText` is gated by ENS ownership of the node (standard ENS auth via `ENS.owner(node)`). For v1 only `BORDEL_NODE` has on-chain state — subnames are virtual.

### 3.2 Dispatch in `resolve(name, data)`

```
1. node = namehash(name)
2. selector = bytes4(data[0:4])
3. require selector == addr.selector  else UnsupportedSelector(selector)   // v1: addr-only
4. if node == BORDEL_NODE:
       return abi.encode(_addr(node))                                       // direct storage read
   else:
       urls = _gatewayUrls()
       require urls.length > 0  else NoGatewayConfigured
       revert OffchainLookup(
           address(this),
           urls,
           data,                                                            // pass-through
           this.resolveWithProof.selector,
           abi.encode(node)                                                 // extraData
       )
```

Unsupported selectors revert deterministically — no gateway roundtrip, no silent miss.

### 3.3 Live-config reads

| Helper | Reads | On parse failure / unset |
|--------|-------|--------------------------|
| `_root()` | `bordel.member-root` | revert `ParameterMissing("member-root")` |
| `_signer()` | `bordel.gateway-signer` | revert `ParameterMissing("gateway-signer")` |
| `_freshness()` | `bordel.freshness-window` | default `30`; cap at `256` |
| `_gatewayUrls()` | `bordel.gateway-url.0..N` | empty array; caller reverts `NoGatewayConfigured` |

`_gatewayUrls()` is two-pass (count, then populate) because Solidity needs the array length up front. Gas is irrelevant — `view` revert path only.

### 3.4 `resolveWithProof(response, extraData)`

Same structure as parent spec §4.4 step 8, with two simplifications:

1. The freshness check (`block.number - r.blockNum < _freshness()`) and the `r.blockNum > block.number - 256` guard collapse — `_freshness()` is capped at `256`, so the `if` branch is always taken. The implementation always verifies `blockhash(r.blockNum) == r.blockHash`.
2. `extraData = abi.encode(node)` (single field). The receipt's `node` field must equal it. `Receipt.value` is returned verbatim; the calling contract decodes it as `address` because v1 is addr-only.

The receipt struct, signing scheme, and field semantics are unchanged.

## 4. Gateway and wallet deltas

The new registry params change two off-chain actors: the wallet (constructing the challenge) and the gateway (validating it). The resolver does not see the challenge.

### 4.1 Challenge construction

To make the domain tag rotatable without concat-length ambiguity, hash it once before mixing in:

```
domain_bytes = text(bordel.eth, "bordel.challenge-domain")  // or "BORDEL_AUTH_V1" if unset
challenge    = keccak256( keccak256(domain_bytes) ‖ nonce ‖ node )
```

All three inputs to the outer hash are 32 bytes. Wallet and gateway compute identically; mismatch → 400.

### 4.2 Wallet flow additions

Before generating the proof:

1. Read `bordel.member-root` and `bordel.challenge-domain` via standard `text()` calls on the parent (no CCIP-Read indirection — parent reads are direct storage in §3.2).
2. Cache both for the session (sessionStorage).
3. Compute challenge as in 4.1.
4. Generate proof with `publicInputs.root = member-root`, `publicInputs.challenge = challenge`.

If a cached receipt fails at the resolver, the wallet drops the cache and regenerates. Domain rotation needs no special handling — a rotated domain just produces a 400 on the next gateway request, which the wallet handles the same way.

### 4.3 Gateway request validation

In addition to the parent spec §4.4 step 6 checks:

- Read `bordel.challenge-domain` from chain on each request (live config; no in-memory cache).
- Recompute `expected_challenge = keccak256(keccak256(domain) ‖ nonce ‖ node)`.
- Require `publicInputs.challenge == expected_challenge` else 400.

The `nonce` is conveyed in the request body (added field, see 4.5). The gateway does not track nonce uniqueness — replay protection is on-chain (I2 freshness, I9 root rotation), not at the gateway.

### 4.4 Multi-gateway topology

`bordel.gateway-url.N` lets multiple gateway replicas serve the same Bordel deployment. viem 2.35+ tries them in order on failure.

Constraints on each replica:

- **Stateless.** No per-replica DB writes; the member set is shared. Storage choice (managed Postgres, CDN-hosted flat file, etc.) is deferred to the implementation plan.
- **Same signer key.** Receipt signature must verify under the single `bordel.gateway-signer` configured on chain. Either each replica holds the key (same key in N envs / KMSes) or one replica signs on behalf of the others — operational choice, deferred.
- **Idempotent.** Replicas must not assume first-attempt; viem may have hit replica A and timed out before retrying replica B with the same payload.

### 4.5 Updated request schema

```json
POST /api/gateway/lookup
{
  "name":         "door.skas.bordel.eth",
  "node":         "0x...",
  "selector":     "0x3b3b57de",
  "selectorArgs": [],
  "nonce":        "0x...32 bytes",
  "proof":        "0x...",
  "publicInputs": {
    "challenge":  "0x...",
    "root":       "0x...",
    "leaf":       "0x..."
  }
}
```

The nonce is also inside the (unrevealed) signed challenge. The gateway needs it explicitly to recompute `expected_challenge` without trusting `publicInputs.challenge` blindly.

## 5. Added invariants

Extending parent spec §5:

| # | Invariant | Enforced by |
|---|-----------|-------------|
| I10 | A request's challenge must be constructed under the currently-configured `bordel.challenge-domain`. | Gateway 4.3 |
| I11 | Subname resolution requires at least one gateway URL configured at lookup time. | Resolver 3.2 |
| I12 | Rotating `bordel.challenge-domain` invalidates outstanding *proofs* but not outstanding *receipts*. | Architectural — domain enters before signing, not into the receipt. |

I12 is consequential: of the three rotation tools (root, signer, domain), only root and signer kill live receipts. Domain rotation is a soft tool — useful for clean version bumps, not for incident response.

## 6. Added failure modes

Extending parent spec §6:

| Case | Outcome |
|------|---------|
| `bordel.gateway-url.*` all unset | Subname `resolve()` reverts `NoGatewayConfigured`. Parent `text()` / `addr()` unaffected. |
| Indexed URL gap (`.0` set, `.1` unset, `.2` set) | Resolver returns `[gateway-url.0]` only. `.2` silently ignored. Admin error. |
| Single gateway URL fails (5xx / timeout) | viem rolls to next URL in `OffchainLookup.urls`. Lookup succeeds if any replica answers. |
| All gateway URLs fail | Resolution fails (revert). UI surfaces as "gate offline." |
| Unsupported selector on subname | Hard revert `UnsupportedSelector(bytes4)`; no gateway roundtrip. |
| Challenge domain rotated mid-session | In-flight proof rejected at gateway with 400; wallet rereads `bordel.challenge-domain` and regenerates. |
| Domain rotated, member has cached receipt | Cached receipt still valid until freshness expires (I12). |
| `bordel.freshness-window` configured > 256 | Internally capped at 256; configured value above 256 silently treated as 256. |

## 7. Added tests

### 7.1 Resolver (Forge), appending to parent §9.2

- `resolve(parent, addr-selector-call)` returns storage value directly, no `OffchainLookup`.
- `resolve(subname, addr-selector-call)` reverts with `OffchainLookup(urls = configured list, ..., extraData = abi.encode(node))`.
- Setting `bordel.gateway-url.0..2` then resolving → `urls.length == 3` in same order.
- Removing `bordel.gateway-url.1` after setting `.0..2` → next resolve returns `urls = [.0]` (gap stops iteration).
- `resolve(subname, text-selector-call)` reverts `UnsupportedSelector(0x59d1d43c)`.
- Subname resolve with no URLs configured reverts `NoGatewayConfigured`.
- `_freshness()` returns `min(parsedValue, 256)`.

### 7.2 Gateway (Vitest), appending to parent §9.3

- `bordel.challenge-domain` unset → gateway recomputes using `"BORDEL_AUTH_V1"` default.
- `bordel.challenge-domain` set → gateway uses that; challenges built with the default are rejected.
- Request includes nonce in body but signed challenge was built under a different nonce → 400.
- Concurrent rotation: domain changes between two requests within the same second → first succeeds with old domain, second rejected. (Test with controlled chain-read seam.)

### 7.3 E2E (Playwright), appending to parent §9.4

- Cached receipt survives a `bordel.challenge-domain` rotation (I12).
- Regeneration after the rotation uses the new domain (gateway accepts).
- Failover: `bordel.gateway-url.0` points at unreachable host, `.1` works → lookup succeeds.

## 8. Open items for implementation plan

- `BordelResolver.sol` exact storage layout (text records as `mapping(bytes32 => mapping(string => string))` vs alternatives) and gas budget for `_gatewayUrls()` two-pass iteration.
- `Strings.toString` source (OZ, manual) and gas cost of `string.concat` on the iteration hot path.
- Receipt signing scheme decision (EIP-191 vs EIP-712) — still deferred from parent spec §11; choice is independent of this addendum.
- Multi-gateway signer-key topology: same key across replicas vs one signing replica vs multisig — operational, not protocol.
- Member DB shared-store choice (Postgres / CDN flat file / etc.).
- Sepolia-specific: which ENSv2 deployment, registration steps for `bordel.eth`, owner multisig setup.
