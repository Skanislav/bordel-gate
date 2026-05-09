# Bordel ENS Registry & Off-chain Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ENSv2 registry of basic properties (text records on `bordel.eth`) and the off-chain resolver behavior described in the addendum spec at `docs/superpowers/specs/2026-05-09-bordel-ens-registry-and-resolver-addendum.md`. Delivers a working `BordelResolver.sol` and a Next.js gateway scaffold that consumes its parameters live, with proof verification stubbed for now.

**Architecture:**
- Solidity resolver (`web/packages/foundry/src/BordelResolver.sol`) holds text records, dispatches `resolve()` per ENSIP-10, reverts `OffchainLookup` for subnames with live-read `string[] urls`, and verifies signed receipts in `resolveWithProof()`. Auth via ENS ownership of the node.
- Next.js gateway (`web/packages/app/src/app/api/gateway/lookup/route.ts`) reads `bordel.member-root` and `bordel.challenge-domain` from chain on each request, validates challenge construction, signs receipts with EIP-191. Proof verification and member DB are stubbed (real implementations land with the parent spec).
- Wallet helpers (`web/packages/app/src/utils/bordel/`) read the registry and construct challenges identically to the gateway.

**Tech Stack:** Solidity ^0.8.20, Foundry, Next.js 15, viem 2.27, vitest, TypeScript, keccak256 only (no Poseidon for v1, deferred to circuit work).

**Out of scope for this plan (parent-spec concerns deferred elsewhere):**
- Real Noir proof verification in the gateway (stub returns `true`).
- Real member DB (stub returns hardcoded fixtures).
- Circuit changes (Merkle inclusion).
- Playwright E2E tests.
- Mainnet deployment / multisig.

---

## File structure

**Solidity (foundry package):**
- Create: `web/packages/foundry/src/interfaces/IENS.sol` — minimal ENS registry interface (just `owner(bytes32)`).
- Create: `web/packages/foundry/src/interfaces/IBordelResolver.sol` — Receipt struct, errors, events.
- Create: `web/packages/foundry/src/BordelResolver.sol` — main contract.
- Create: `web/packages/foundry/test/mocks/MockENS.sol` — test-only ENS mock.
- Create: `web/packages/foundry/test/BordelResolver.t.sol` — Forge tests.
- Create: `web/packages/foundry/script/DeployBordelResolver.s.sol` — deploy script.

**Gateway (Next.js app package):**
- Create: `web/packages/app/src/app/api/gateway/lookup/route.ts` — handler.
- Create: `web/packages/app/src/app/api/gateway/_lib/registry.ts` — chain reads.
- Create: `web/packages/app/src/app/api/gateway/_lib/challenge.ts` — challenge construction.
- Create: `web/packages/app/src/app/api/gateway/_lib/receipt.ts` — Receipt encode + EIP-191 sign.
- Create: `web/packages/app/src/app/api/gateway/_lib/db.ts` — member DB stub.
- Create: `web/packages/app/src/app/api/gateway/_lib/verify.ts` — proof verifier stub.
- Create: `web/packages/app/src/app/api/gateway/_lib/__tests__/challenge.test.ts`
- Create: `web/packages/app/src/app/api/gateway/_lib/__tests__/receipt.test.ts`
- Create: `web/packages/app/src/app/api/gateway/_lib/__tests__/registry.test.ts`
- Create: `web/packages/app/src/app/api/gateway/lookup/__tests__/route.test.ts`
- Create: `web/packages/app/vitest.config.ts`

**Wallet (Next.js app package):**
- Create: `web/packages/app/src/utils/bordel/registry.ts` — read parent records.
- Create: `web/packages/app/src/utils/bordel/challenge.ts` — wallet-side challenge builder.
- Create: `web/packages/app/src/utils/bordel/__tests__/challenge.test.ts`

---

## Task 1: Foundry — interfaces and skeleton

**Files:**
- Create: `web/packages/foundry/src/interfaces/IENS.sol`
- Create: `web/packages/foundry/src/interfaces/IBordelResolver.sol`
- Create: `web/packages/foundry/src/BordelResolver.sol`
- Create: `web/packages/foundry/test/mocks/MockENS.sol`

- [ ] **Step 1: Create the ENS interface**

Write `web/packages/foundry/src/interfaces/IENS.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IENS {
    function owner(bytes32 node) external view returns (address);
}
```

- [ ] **Step 2: Create the resolver interface (errors, events, Receipt struct)**

Write `web/packages/foundry/src/interfaces/IBordelResolver.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBordelResolver {
    struct Receipt {
        bytes32 node;
        bytes value;
        bytes32 signedRoot;
        uint64 blockNum;
        bytes32 blockHash;
    }

    error ParameterMissing(string key);
    error NoGatewayConfigured();
    error UnsupportedSelector(bytes4 selector);
    error NotAuthorized();
    error BadSignature();
    error NodeMismatch();
    error StaleRoot();
    error StaleBlock();
    error ReorgedBlock();
    error MalformedHex(string field);

    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    event AddrChanged(bytes32 indexed node, address newAddress);
    event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value);
}
```

- [ ] **Step 3: Create the resolver skeleton (compiles, no behavior yet)**

Write `web/packages/foundry/src/BordelResolver.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IENS} from "./interfaces/IENS.sol";
import {IBordelResolver} from "./interfaces/IBordelResolver.sol";

contract BordelResolver is IBordelResolver {
    IENS public immutable ens;
    bytes32 public immutable bordelNode;

    mapping(bytes32 => mapping(string => string)) private _texts;
    mapping(bytes32 => address) private _addrs;

    constructor(IENS _ens, bytes32 _bordelNode) {
        ens = _ens;
        bordelNode = _bordelNode;
    }
}
```

- [ ] **Step 4: Create a minimal ENS mock for tests**

Write `web/packages/foundry/test/mocks/MockENS.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IENS} from "../../src/interfaces/IENS.sol";

contract MockENS is IENS {
    mapping(bytes32 => address) public owners;

    function setOwner(bytes32 node, address who) external {
        owners[node] = who;
    }

    function owner(bytes32 node) external view returns (address) {
        return owners[node];
    }
}
```

- [ ] **Step 5: Compile and commit**

Run: `cd web/packages/foundry && forge build`
Expected: "Compiler run successful" (warnings about unused state variables OK).

```bash
git add web/packages/foundry/src/interfaces web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/mocks/MockENS.sol
git commit -m "feat: bordel resolver skeleton + ENS interfaces"
```

---

## Task 2: Parent text records — `text()` / `setText()`

**Files:**
- Modify: `web/packages/foundry/src/BordelResolver.sol`
- Create: `web/packages/foundry/test/BordelResolver.t.sol`

- [ ] **Step 1: Write failing tests for text + setText**

Write `web/packages/foundry/test/BordelResolver.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BordelResolver} from "../src/BordelResolver.sol";
import {IBordelResolver} from "../src/interfaces/IBordelResolver.sol";
import {MockENS} from "./mocks/MockENS.sol";

contract BordelResolverTest is Test {
    BordelResolver internal resolver;
    MockENS internal ens;
    bytes32 internal constant BORDEL_NODE = keccak256("bordel.eth.test.node");
    address internal owner = address(0xB0DE1);
    address internal stranger = address(0xDEAD);

    event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value);

    function setUp() public {
        ens = new MockENS();
        ens.setOwner(BORDEL_NODE, owner);
        resolver = new BordelResolver(ens, BORDEL_NODE);
    }

    function test_setText_byOwner_updatesValue() public {
        vm.prank(owner);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0x1234");
        assertEq(resolver.text(BORDEL_NODE, "bordel.member-root"), "0x1234");
    }

    function test_setText_byStranger_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(IBordelResolver.NotAuthorized.selector);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0x1234");
    }

    function test_setText_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit TextChanged(BORDEL_NODE, "bordel.member-root", "bordel.member-root", "0xabcd");
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0xabcd");
    }

    function test_text_unsetReturnsEmpty() public view {
        assertEq(resolver.text(BORDEL_NODE, "nonexistent"), "");
    }
}
```

- [ ] **Step 2: Run tests — expect compile fail (text/setText not defined)**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`
Expected: compile error or "function does not exist".

- [ ] **Step 3: Implement text() and setText()**

Add to `web/packages/foundry/src/BordelResolver.sol` (inside the contract):

```solidity
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _texts[node][key];
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        if (ens.owner(node) != msg.sender) revert NotAuthorized();
        _texts[node][key] = value;
        emit TextChanged(node, key, key, value);
    }
```

- [ ] **Step 4: Run tests — expect pass**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/BordelResolver.t.sol
git commit -m "feat: text() / setText() with ENS-owner auth"
```

---

## Task 3: Parent addr storage — `addr()` / `setAddr()`

**Files:**
- Modify: `web/packages/foundry/src/BordelResolver.sol`
- Modify: `web/packages/foundry/test/BordelResolver.t.sol`

- [ ] **Step 1: Add failing tests**

Append to `BordelResolverTest`:

```solidity
    event AddrChanged(bytes32 indexed node, address newAddress);

    function test_setAddr_byOwner() public {
        vm.prank(owner);
        resolver.setAddr(BORDEL_NODE, address(0xABCD));
        assertEq(resolver.addr(BORDEL_NODE), address(0xABCD));
    }

    function test_setAddr_byStranger_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(IBordelResolver.NotAuthorized.selector);
        resolver.setAddr(BORDEL_NODE, address(0xABCD));
    }

    function test_setAddr_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit AddrChanged(BORDEL_NODE, address(0xABCD));
        resolver.setAddr(BORDEL_NODE, address(0xABCD));
    }

    function test_addr_unsetReturnsZero() public view {
        assertEq(resolver.addr(BORDEL_NODE), address(0));
    }
```

- [ ] **Step 2: Run — expect compile fail**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 3: Implement addr() and setAddr()**

Add to `BordelResolver.sol`:

```solidity
    function addr(bytes32 node) external view returns (address) {
        return _addrs[node];
    }

    function setAddr(bytes32 node, address newAddress) external {
        if (ens.owner(node) != msg.sender) revert NotAuthorized();
        _addrs[node] = newAddress;
        emit AddrChanged(node, newAddress);
    }
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`
Expected: all tests (now 8) pass.

- [ ] **Step 5: Commit**

```bash
git add web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/BordelResolver.t.sol
git commit -m "feat: addr() / setAddr() with ENS-owner auth"
```

---

## Task 4: Hex parsers and live-config helpers

**Files:**
- Modify: `web/packages/foundry/src/BordelResolver.sol`
- Modify: `web/packages/foundry/test/BordelResolver.t.sol`

We need: `_root() → bytes32`, `_signer() → address`, `_freshness() → uint256`. Each parses a text record and reverts `ParameterMissing` (or returns a default for freshness).

- [ ] **Step 1: Write failing tests for the public-readable wrappers**

Add public wrappers `memberRoot()`, `gatewaySigner()`, `freshnessWindow()` (we want the parsers exercisable from tests; these double as debug accessors).

Append to `BordelResolverTest`:

```solidity
    function _setRoot(bytes32 root) internal {
        vm.prank(owner);
        resolver.setText(BORDEL_NODE, "bordel.member-root", _toHex32(root));
    }

    function _setSigner(address signer) internal {
        vm.prank(owner);
        resolver.setText(BORDEL_NODE, "bordel.gateway-signer", _toHex20(signer));
    }

    function _setFreshness(string memory s) internal {
        vm.prank(owner);
        resolver.setText(BORDEL_NODE, "bordel.freshness-window", s);
    }

    function _toHex32(bytes32 v) internal pure returns (string memory) {
        bytes16 hexChars = "0123456789abcdef";
        bytes memory s = new bytes(66);
        s[0] = "0"; s[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(v[i]);
            s[2 + i*2] = hexChars[b >> 4];
            s[3 + i*2] = hexChars[b & 0x0f];
        }
        return string(s);
    }

    function _toHex20(address a) internal pure returns (string memory) {
        bytes16 hexChars = "0123456789abcdef";
        bytes memory s = new bytes(42);
        s[0] = "0"; s[1] = "x";
        bytes20 v = bytes20(a);
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(v[i]);
            s[2 + i*2] = hexChars[b >> 4];
            s[3 + i*2] = hexChars[b & 0x0f];
        }
        return string(s);
    }

    function test_memberRoot_unset_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(IBordelResolver.ParameterMissing.selector, "member-root"));
        resolver.memberRoot();
    }

    function test_memberRoot_set_returnsParsedValue() public {
        bytes32 r = bytes32(uint256(0x1122334455667788990011223344556677889900112233445566778899001122));
        _setRoot(r);
        assertEq(resolver.memberRoot(), r);
    }

    function test_gatewaySigner_unset_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(IBordelResolver.ParameterMissing.selector, "gateway-signer"));
        resolver.gatewaySigner();
    }

    function test_gatewaySigner_set_returnsParsedValue() public {
        address s = address(0xCAFE0000000000000000000000000000DEADBEEF);
        _setSigner(s);
        assertEq(resolver.gatewaySigner(), s);
    }

    function test_freshness_unset_returnsDefault30() public view {
        assertEq(resolver.freshnessWindow(), 30);
    }

    function test_freshness_set_parses() public {
        _setFreshness("100");
        assertEq(resolver.freshnessWindow(), 100);
    }

    function test_freshness_capsAt256() public {
        _setFreshness("9999");
        assertEq(resolver.freshnessWindow(), 256);
    }

    function test_memberRoot_malformed_reverts() public {
        vm.prank(owner);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "not-hex");
        vm.expectRevert(abi.encodeWithSelector(IBordelResolver.MalformedHex.selector, "member-root"));
        resolver.memberRoot();
    }
```

- [ ] **Step 2: Run — expect compile fail**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 3: Implement the parsers and accessors**

Add to `BordelResolver.sol`:

```solidity
    uint256 internal constant DEFAULT_FRESHNESS = 30;
    uint256 internal constant MAX_FRESHNESS = 256;

    function memberRoot() public view returns (bytes32) {
        return _parseBytes32(_texts[bordelNode]["bordel.member-root"], "member-root");
    }

    function gatewaySigner() public view returns (address) {
        return _parseAddress(_texts[bordelNode]["bordel.gateway-signer"], "gateway-signer");
    }

    function freshnessWindow() public view returns (uint256) {
        string memory raw = _texts[bordelNode]["bordel.freshness-window"];
        if (bytes(raw).length == 0) return DEFAULT_FRESHNESS;
        uint256 v = _parseUint(raw, "freshness-window");
        return v > MAX_FRESHNESS ? MAX_FRESHNESS : v;
    }

    function _parseBytes32(string memory s, string memory field) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        if (b.length == 0) revert ParameterMissing(field);
        if (b.length != 66 || b[0] != "0" || b[1] != "x") revert MalformedHex(field);
        bytes32 result;
        for (uint256 i = 0; i < 32; i++) {
            uint8 hi = _nibble(b[2 + i*2], field);
            uint8 lo = _nibble(b[3 + i*2], field);
            result |= bytes32(uint256(uint8((hi << 4) | lo)) << (8 * (31 - i)));
        }
        return result;
    }

    function _parseAddress(string memory s, string memory field) internal pure returns (address) {
        bytes memory b = bytes(s);
        if (b.length == 0) revert ParameterMissing(field);
        if (b.length != 42 || b[0] != "0" || b[1] != "x") revert MalformedHex(field);
        uint160 result;
        for (uint256 i = 0; i < 20; i++) {
            uint8 hi = _nibble(b[2 + i*2], field);
            uint8 lo = _nibble(b[3 + i*2], field);
            result = (result << 8) | uint160(uint8((hi << 4) | lo));
        }
        return address(result);
    }

    function _parseUint(string memory s, string memory field) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        if (b.length == 0) revert ParameterMissing(field);
        uint256 result;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c < 0x30 || c > 0x39) revert MalformedHex(field);
            result = result * 10 + (c - 0x30);
        }
        return result;
    }

    function _nibble(bytes1 c, string memory field) internal pure returns (uint8) {
        uint8 v = uint8(c);
        if (v >= 0x30 && v <= 0x39) return v - 0x30;
        if (v >= 0x61 && v <= 0x66) return v - 0x61 + 10;
        if (v >= 0x41 && v <= 0x46) return v - 0x41 + 10;
        revert MalformedHex(field);
    }
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/BordelResolver.t.sol
git commit -m "feat: parse member-root, gateway-signer, freshness from text records"
```

---

## Task 5: Gateway URL iteration — `_gatewayUrls()`

**Files:**
- Modify: `web/packages/foundry/src/BordelResolver.sol`
- Modify: `web/packages/foundry/test/BordelResolver.t.sol`

- [ ] **Step 1: Write failing tests**

Append:

```solidity
    function _setUrl(uint256 i, string memory url) internal {
        vm.prank(owner);
        resolver.setText(BORDEL_NODE, _urlKey(i), url);
    }

    function _urlKey(uint256 i) internal pure returns (string memory) {
        return string.concat("bordel.gateway-url.", _u(i));
    }

    function _u(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory buf = new bytes(d);
        while (v != 0) { d -= 1; buf[d] = bytes1(uint8(0x30 + v % 10)); v /= 10; }
        return string(buf);
    }

    function test_gatewayUrls_emptyByDefault() public view {
        string[] memory urls = resolver.gatewayUrls();
        assertEq(urls.length, 0);
    }

    function test_gatewayUrls_singleEntry() public {
        _setUrl(0, "https://a.example/lookup");
        string[] memory urls = resolver.gatewayUrls();
        assertEq(urls.length, 1);
        assertEq(urls[0], "https://a.example/lookup");
    }

    function test_gatewayUrls_multipleContiguous() public {
        _setUrl(0, "https://a.example/lookup");
        _setUrl(1, "https://b.example/lookup");
        _setUrl(2, "https://c.example/lookup");
        string[] memory urls = resolver.gatewayUrls();
        assertEq(urls.length, 3);
        assertEq(urls[0], "https://a.example/lookup");
        assertEq(urls[1], "https://b.example/lookup");
        assertEq(urls[2], "https://c.example/lookup");
    }

    function test_gatewayUrls_gapStopsIteration() public {
        _setUrl(0, "https://a.example/lookup");
        // intentionally skip 1
        _setUrl(2, "https://c.example/lookup");
        string[] memory urls = resolver.gatewayUrls();
        assertEq(urls.length, 1);
        assertEq(urls[0], "https://a.example/lookup");
    }
```

- [ ] **Step 2: Run — expect compile fail**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 3: Implement `gatewayUrls()`**

Add to `BordelResolver.sol`:

```solidity
    function gatewayUrls() public view returns (string[] memory) {
        uint256 count = 0;
        while (bytes(_texts[bordelNode][_urlKey(count)]).length > 0) {
            count++;
        }
        string[] memory urls = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            urls[i] = _texts[bordelNode][_urlKey(i)];
        }
        return urls;
    }

    function _urlKey(uint256 i) internal pure returns (string memory) {
        return string.concat("bordel.gateway-url.", _uintToStr(i));
    }

    function _uintToStr(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory buf = new bytes(d);
        while (v != 0) { d -= 1; buf[d] = bytes1(uint8(0x30 + v % 10)); v /= 10; }
        return string(buf);
    }
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 5: Commit**

```bash
git add web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/BordelResolver.t.sol
git commit -m "feat: iterate bordel.gateway-url.N text records"
```

---

## Task 6: ENSIP-10 `resolve()` — parent path

**Files:**
- Modify: `web/packages/foundry/src/BordelResolver.sol`
- Modify: `web/packages/foundry/test/BordelResolver.t.sol`

For the parent node, `resolve(name, data)` decodes the addr selector and returns storage value directly.

- [ ] **Step 1: Write failing tests**

Append to test:

```solidity
    bytes4 internal constant ADDR_SEL = bytes4(keccak256("addr(bytes32)"));
    bytes4 internal constant TEXT_SEL = bytes4(keccak256("text(bytes32,string)"));

    function _dnsEncode(string memory) internal pure returns (bytes memory) {
        // Test does not assert structure of `name`; resolver derives node from data.
        return hex"";
    }

    function test_resolve_parent_addr_returnsDirectValue() public {
        vm.prank(owner);
        resolver.setAddr(BORDEL_NODE, address(0xBEEF));
        bytes memory data = abi.encodeWithSelector(ADDR_SEL, BORDEL_NODE);
        bytes memory result = resolver.resolve(_dnsEncode("bordel.eth"), data);
        assertEq(abi.decode(result, (address)), address(0xBEEF));
    }

    function test_resolve_unsupportedSelector_reverts() public {
        bytes memory data = abi.encodeWithSelector(TEXT_SEL, BORDEL_NODE, "bordel.tier");
        vm.expectRevert(abi.encodeWithSelector(IBordelResolver.UnsupportedSelector.selector, TEXT_SEL));
        resolver.resolve(_dnsEncode("door.skas.bordel.eth"), data);
    }
```

- [ ] **Step 2: Run — expect compile fail**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 3: Implement parent-path of `resolve()`**

Add to `BordelResolver.sol`:

```solidity
    function resolve(bytes calldata, bytes calldata data) external view returns (bytes memory) {
        bytes4 selector = bytes4(data[0:4]);
        if (selector != bytes4(keccak256("addr(bytes32)"))) revert UnsupportedSelector(selector);
        bytes32 node = abi.decode(data[4:], (bytes32));
        if (node == bordelNode) {
            return abi.encode(_addrs[node]);
        }
        // Subname path filled in next task.
        revert UnsupportedSelector(selector);
    }
```

(The `revert UnsupportedSelector` on the subname branch is a placeholder; Task 7 replaces it with `OffchainLookup`.)

- [ ] **Step 4: Run — expect pass on parent test, fail or unrelated revert on subname tests we add later**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`
Expected: parent tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/BordelResolver.t.sol
git commit -m "feat: resolve() returns parent addr directly"
```

---

## Task 7: ENSIP-10 `resolve()` — subname path with `OffchainLookup`

**Files:**
- Modify: `web/packages/foundry/src/BordelResolver.sol`
- Modify: `web/packages/foundry/test/BordelResolver.t.sol`

- [ ] **Step 1: Write failing tests**

Append:

```solidity
    bytes32 internal constant SUBNAME_NODE = keccak256("door.skas.bordel.eth.test.node");

    function test_resolve_subname_revertsOffchainLookup() public {
        _setUrl(0, "https://a.example/lookup");
        _setUrl(1, "https://b.example/lookup");
        bytes memory data = abi.encodeWithSelector(ADDR_SEL, SUBNAME_NODE);

        // Encode the expected revert payload
        string[] memory expectedUrls = new string[](2);
        expectedUrls[0] = "https://a.example/lookup";
        expectedUrls[1] = "https://b.example/lookup";

        vm.expectRevert(
            abi.encodeWithSelector(
                IBordelResolver.OffchainLookup.selector,
                address(resolver),
                expectedUrls,
                data,
                BordelResolver.resolveWithProof.selector,
                abi.encode(SUBNAME_NODE)
            )
        );
        resolver.resolve(_dnsEncode("door.skas.bordel.eth"), data);
    }

    function test_resolve_subname_noUrls_revertsNoGatewayConfigured() public {
        bytes memory data = abi.encodeWithSelector(ADDR_SEL, SUBNAME_NODE);
        vm.expectRevert(IBordelResolver.NoGatewayConfigured.selector);
        resolver.resolve(_dnsEncode("door.skas.bordel.eth"), data);
    }
```

- [ ] **Step 2: Run — expect fail (still routes to UnsupportedSelector placeholder)**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 3: Replace the placeholder with the real subname path**

Edit `BordelResolver.sol`. Replace the body of `resolve()`:

```solidity
    function resolve(bytes calldata, bytes calldata data) external view returns (bytes memory) {
        bytes4 selector = bytes4(data[0:4]);
        if (selector != bytes4(keccak256("addr(bytes32)"))) revert UnsupportedSelector(selector);
        bytes32 node = abi.decode(data[4:], (bytes32));
        if (node == bordelNode) {
            return abi.encode(_addrs[node]);
        }
        string[] memory urls = gatewayUrls();
        if (urls.length == 0) revert NoGatewayConfigured();
        revert OffchainLookup(
            address(this),
            urls,
            data,
            this.resolveWithProof.selector,
            abi.encode(node)
        );
    }

    function resolveWithProof(bytes calldata, bytes calldata) external view returns (bytes memory) {
        revert("not implemented");
    }
```

(The `resolveWithProof` is declared as a stub so its selector exists. Task 8 implements it.)

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 5: Commit**

```bash
git add web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/BordelResolver.t.sol
git commit -m "feat: resolve() reverts OffchainLookup for subnames"
```

---

## Task 8: `resolveWithProof()` callback

**Files:**
- Modify: `web/packages/foundry/src/BordelResolver.sol`
- Modify: `web/packages/foundry/test/BordelResolver.t.sol`

- [ ] **Step 1: Write failing tests covering the full receipt verification surface**

Append to test:

```solidity
    uint256 internal signerKey = 0xA11CE;
    address internal signerAddr;

    function _installSigner() internal {
        signerAddr = vm.addr(signerKey);
        _setSigner(signerAddr);
    }

    function _signReceipt(IBordelResolver.Receipt memory r) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(r))
        ));
        (uint8 v, bytes32 sigR, bytes32 sigS) = vm.sign(signerKey, digest);
        return abi.encodePacked(sigR, sigS, v);
    }

    function _validReceipt(bytes32 node, address value) internal view returns (IBordelResolver.Receipt memory) {
        return IBordelResolver.Receipt({
            node: node,
            value: abi.encode(value),
            signedRoot: resolver.memberRoot(),
            blockNum: uint64(block.number - 1),
            blockHash: blockhash(block.number - 1)
        });
    }

    function _seedRootAndSigner() internal {
        _setRoot(bytes32(uint256(0xC0FFEE)));
        _installSigner();
    }

    function test_resolveWithProof_happyPath_returnsValue() public {
        _seedRootAndSigner();
        vm.roll(100);
        IBordelResolver.Receipt memory r = _validReceipt(SUBNAME_NODE, address(0xBEEF));
        bytes memory sig = _signReceipt(r);
        bytes memory response = abi.encode(r, sig);
        bytes memory result = resolver.resolveWithProof(response, abi.encode(SUBNAME_NODE));
        assertEq(abi.decode(result, (address)), address(0xBEEF));
    }

    function test_resolveWithProof_badSig_reverts() public {
        _seedRootAndSigner();
        vm.roll(100);
        IBordelResolver.Receipt memory r = _validReceipt(SUBNAME_NODE, address(0xBEEF));
        bytes memory sig = _signReceipt(r);
        // Flip a byte
        sig[0] = bytes1(uint8(sig[0]) ^ 0x01);
        bytes memory response = abi.encode(r, sig);
        vm.expectRevert(IBordelResolver.BadSignature.selector);
        resolver.resolveWithProof(response, abi.encode(SUBNAME_NODE));
    }

    function test_resolveWithProof_nodeMismatch_reverts() public {
        _seedRootAndSigner();
        vm.roll(100);
        IBordelResolver.Receipt memory r = _validReceipt(SUBNAME_NODE, address(0xBEEF));
        bytes memory sig = _signReceipt(r);
        bytes memory response = abi.encode(r, sig);
        bytes32 differentNode = keccak256("other.bordel.eth.test");
        vm.expectRevert(IBordelResolver.NodeMismatch.selector);
        resolver.resolveWithProof(response, abi.encode(differentNode));
    }

    function test_resolveWithProof_staleRoot_reverts() public {
        _seedRootAndSigner();
        vm.roll(100);
        IBordelResolver.Receipt memory r = _validReceipt(SUBNAME_NODE, address(0xBEEF));
        bytes memory sig = _signReceipt(r);
        bytes memory response = abi.encode(r, sig);
        // Rotate root after signing
        _setRoot(bytes32(uint256(0xC0FFEE + 1)));
        vm.expectRevert(IBordelResolver.StaleRoot.selector);
        resolver.resolveWithProof(response, abi.encode(SUBNAME_NODE));
    }

    function test_resolveWithProof_staleBlock_reverts() public {
        _seedRootAndSigner();
        vm.roll(100);
        IBordelResolver.Receipt memory r = _validReceipt(SUBNAME_NODE, address(0xBEEF));
        bytes memory sig = _signReceipt(r);
        bytes memory response = abi.encode(r, sig);
        // Roll past freshness window (default 30)
        vm.roll(200);
        vm.expectRevert(IBordelResolver.StaleBlock.selector);
        resolver.resolveWithProof(response, abi.encode(SUBNAME_NODE));
    }

    function test_resolveWithProof_blockhashMismatch_reverts() public {
        _seedRootAndSigner();
        vm.roll(100);
        IBordelResolver.Receipt memory r = _validReceipt(SUBNAME_NODE, address(0xBEEF));
        r.blockHash = bytes32(uint256(0xDEADBEEF));
        bytes memory sig = _signReceipt(r);
        bytes memory response = abi.encode(r, sig);
        vm.expectRevert(IBordelResolver.ReorgedBlock.selector);
        resolver.resolveWithProof(response, abi.encode(SUBNAME_NODE));
    }

    function test_resolveWithProof_signerRotated_reverts() public {
        _seedRootAndSigner();
        vm.roll(100);
        IBordelResolver.Receipt memory r = _validReceipt(SUBNAME_NODE, address(0xBEEF));
        bytes memory sig = _signReceipt(r);
        bytes memory response = abi.encode(r, sig);
        _setSigner(address(0xFACE));
        vm.expectRevert(IBordelResolver.BadSignature.selector);
        resolver.resolveWithProof(response, abi.encode(SUBNAME_NODE));
    }
```

- [ ] **Step 2: Run — expect fail (current stub reverts "not implemented")**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 3: Implement `resolveWithProof()`**

Replace the stub in `BordelResolver.sol`:

```solidity
    function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns (bytes memory) {
        bytes32 expectedNode = abi.decode(extraData, (bytes32));
        (Receipt memory r, bytes memory sig) = abi.decode(response, (Receipt, bytes));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(r))
        ));
        if (_recover(digest, sig) != gatewaySigner()) revert BadSignature();
        if (r.node != expectedNode) revert NodeMismatch();
        if (r.signedRoot != memberRoot()) revert StaleRoot();
        if (block.number - r.blockNum >= freshnessWindow()) revert StaleBlock();
        if (blockhash(r.blockNum) != r.blockHash) revert ReorgedBlock();
        return r.value;
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 sigR;
        bytes32 sigS;
        uint8 v;
        assembly {
            sigR := mload(add(sig, 32))
            sigS := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, sigR, sigS);
    }
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 5: Commit**

```bash
git add web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/BordelResolver.t.sol
git commit -m "feat: resolveWithProof verifies sig + freshness + blockhash"
```

---

## Task 9: `supportsInterface` and deploy script

**Files:**
- Modify: `web/packages/foundry/src/BordelResolver.sol`
- Modify: `web/packages/foundry/test/BordelResolver.t.sol`
- Create: `web/packages/foundry/script/DeployBordelResolver.s.sol`

- [ ] **Step 1: Write failing tests**

Append:

```solidity
    function test_supportsInterface_addr() public view {
        // ENS addr resolver interface id (ENSIP-1)
        assertTrue(resolver.supportsInterface(bytes4(keccak256("addr(bytes32)"))));
    }

    function test_supportsInterface_text() public view {
        // ENS text resolver interface id
        assertTrue(resolver.supportsInterface(bytes4(keccak256("text(bytes32,string)"))));
    }

    function test_supportsInterface_resolve() public view {
        // ENSIP-10 wildcard interface id
        assertTrue(resolver.supportsInterface(bytes4(keccak256("resolve(bytes,bytes)"))));
    }

    function test_supportsInterface_erc165() public view {
        assertTrue(resolver.supportsInterface(0x01ffc9a7));
    }

    function test_supportsInterface_unknown_false() public view {
        assertFalse(resolver.supportsInterface(0xffffffff));
    }
```

- [ ] **Step 2: Run — expect compile fail**

- [ ] **Step 3: Implement `supportsInterface`**

Add:

```solidity
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7  // ERC-165
            || id == bytes4(keccak256("addr(bytes32)"))
            || id == bytes4(keccak256("text(bytes32,string)"))
            || id == bytes4(keccak256("resolve(bytes,bytes)"));
    }
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/foundry && forge test --match-contract BordelResolverTest -vv`

- [ ] **Step 5: Write the deploy script**

Write `web/packages/foundry/script/DeployBordelResolver.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {BordelResolver} from "../src/BordelResolver.sol";
import {IENS} from "../src/interfaces/IENS.sol";

contract DeployBordelResolver is Script {
    function run() external {
        address ensAddr = vm.envAddress("ENS_REGISTRY");
        bytes32 bordelNode = vm.envBytes32("BORDEL_NODE");

        vm.startBroadcast();
        BordelResolver resolver = new BordelResolver(IENS(ensAddr), bordelNode);
        vm.stopBroadcast();

        console.log("BordelResolver deployed at:", address(resolver));
    }
}
```

- [ ] **Step 6: Verify the deploy script compiles**

Run: `cd web/packages/foundry && forge build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add web/packages/foundry/src/BordelResolver.sol web/packages/foundry/test/BordelResolver.t.sol web/packages/foundry/script/DeployBordelResolver.s.sol
git commit -m "feat: supportsInterface + deploy script"
```

---

## Task 10: Vitest setup in app package

**Files:**
- Modify: `web/packages/app/package.json`
- Create: `web/packages/app/vitest.config.ts`

- [ ] **Step 1: Add vitest deps**

Run:
```bash
cd web/packages/app && npm install --save-dev vitest @vitest/ui happy-dom
```

- [ ] **Step 2: Add a `test` script to package.json**

Edit `web/packages/app/package.json`. Inside the `scripts` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest config**

Write `web/packages/app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
```

- [ ] **Step 4: Verify vitest runs (no tests yet → exits clean)**

Run: `cd web/packages/app && npm test`
Expected: "No test files found" or 0 tests passed; exits 0 if you pass `--passWithNoTests`. Add the flag if needed:

If exit code is non-zero, change the script to `"test": "vitest run --passWithNoTests"`.

- [ ] **Step 5: Commit**

```bash
git add web/packages/app/package.json web/packages/app/vitest.config.ts web/packages/app/package-lock.json
git commit -m "chore: add vitest to app package"
```

---

## Task 11: Gateway — challenge construction module

**Files:**
- Create: `web/packages/app/src/app/api/gateway/_lib/challenge.ts`
- Create: `web/packages/app/src/app/api/gateway/_lib/__tests__/challenge.test.ts`

- [ ] **Step 1: Write failing tests**

Write `web/packages/app/src/app/api/gateway/_lib/__tests__/challenge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { keccak256, toBytes, concat, stringToBytes } from 'viem'
import { computeChallenge, DEFAULT_CHALLENGE_DOMAIN } from '../challenge'

const node = '0xabababababababababababababababababababababababababababababababab' as const
const nonce = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd' as const

describe('computeChallenge', () => {
  it('uses the default domain when domain is empty', () => {
    const expected = keccak256(
      concat([keccak256(stringToBytes(DEFAULT_CHALLENGE_DOMAIN)), toBytes(nonce), toBytes(node)])
    )
    expect(computeChallenge({ domain: '', nonce, node })).toBe(expected)
  })

  it('uses the configured domain when set', () => {
    const domain = 'BORDEL_AUTH_V2'
    const expected = keccak256(
      concat([keccak256(stringToBytes(domain)), toBytes(nonce), toBytes(node)])
    )
    expect(computeChallenge({ domain, nonce, node })).toBe(expected)
  })

  it('different domain → different challenge', () => {
    const a = computeChallenge({ domain: 'A', nonce, node })
    const b = computeChallenge({ domain: 'B', nonce, node })
    expect(a).not.toBe(b)
  })

  it('different nonce → different challenge', () => {
    const otherNonce = '0x0000000000000000000000000000000000000000000000000000000000000001' as const
    const a = computeChallenge({ domain: 'X', nonce, node })
    const b = computeChallenge({ domain: 'X', nonce: otherNonce, node })
    expect(a).not.toBe(b)
  })

  it('different node → different challenge', () => {
    const otherNode = '0x0000000000000000000000000000000000000000000000000000000000000002' as const
    const a = computeChallenge({ domain: 'X', nonce, node })
    const b = computeChallenge({ domain: 'X', nonce, node: otherNode })
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run — expect fail (module not found)**

Run: `cd web/packages/app && npm test -- challenge.test.ts`

- [ ] **Step 3: Implement `challenge.ts`**

Write `web/packages/app/src/app/api/gateway/_lib/challenge.ts`:

```ts
import { keccak256, concat, toBytes, stringToBytes, type Hex } from 'viem'

export const DEFAULT_CHALLENGE_DOMAIN = 'BORDEL_AUTH_V1'

export function computeChallenge(input: { domain: string; nonce: Hex; node: Hex }): Hex {
  const domainBytes = stringToBytes(input.domain || DEFAULT_CHALLENGE_DOMAIN)
  return keccak256(
    concat([keccak256(domainBytes), toBytes(input.nonce), toBytes(input.node)])
  )
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/app && npm test -- challenge.test.ts`
Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add web/packages/app/src/app/api/gateway/_lib/challenge.ts web/packages/app/src/app/api/gateway/_lib/__tests__/challenge.test.ts
git commit -m "feat: gateway challenge construction module"
```

---

## Task 12: Gateway — receipt encode + sign module

**Files:**
- Create: `web/packages/app/src/app/api/gateway/_lib/receipt.ts`
- Create: `web/packages/app/src/app/api/gateway/_lib/__tests__/receipt.test.ts`

- [ ] **Step 1: Write failing tests**

Write `web/packages/app/src/app/api/gateway/_lib/__tests__/receipt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { encodeAbiParameters, hashMessage, keccak256, recoverAddress } from 'viem'
import { encodeReceipt, signReceipt, RECEIPT_ABI, type Receipt } from '../receipt'

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')

const sample: Receipt = {
  node: '0xabababababababababababababababababababababababababababababababab',
  value: '0x000000000000000000000000beefbeefbeefbeefbeefbeefbeefbeefbeefbeef',
  signedRoot: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff',
  blockNum: 100n,
  blockHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
}

describe('receipt encoding', () => {
  it('encodeReceipt is reversible', () => {
    const encoded = encodeReceipt(sample)
    const decoded = encodeAbiParameters(RECEIPT_ABI, [sample])
    expect(encoded).toBe(decoded)
  })
})

describe('signReceipt', () => {
  it('signature recovers to the signing account (EIP-191)', async () => {
    const sig = await signReceipt(account, sample)
    const recovered = await recoverAddress({
      hash: hashMessage({ raw: keccak256(encodeReceipt(sample)) }),
      signature: sig,
    })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })
})
```

- [ ] **Step 2: Run — expect fail (module not found)**

Run: `cd web/packages/app && npm test -- receipt.test.ts`

- [ ] **Step 3: Implement `receipt.ts`**

Write `web/packages/app/src/app/api/gateway/_lib/receipt.ts`:

```ts
import {
  encodeAbiParameters,
  hashMessage,
  keccak256,
  type Hex,
  type LocalAccount,
} from 'viem'

export interface Receipt {
  node: Hex
  value: Hex
  signedRoot: Hex
  blockNum: bigint
  blockHash: Hex
}

export const RECEIPT_ABI = [
  {
    type: 'tuple',
    components: [
      { name: 'node', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'signedRoot', type: 'bytes32' },
      { name: 'blockNum', type: 'uint64' },
      { name: 'blockHash', type: 'bytes32' },
    ],
  },
] as const

export function encodeReceipt(r: Receipt): Hex {
  return encodeAbiParameters(RECEIPT_ABI, [r])
}

export async function signReceipt(account: LocalAccount, r: Receipt): Promise<Hex> {
  const inner = keccak256(encodeReceipt(r))
  const digest = hashMessage({ raw: inner })
  return account.sign({ hash: digest })
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/app && npm test -- receipt.test.ts`

- [ ] **Step 5: Commit**

```bash
git add web/packages/app/src/app/api/gateway/_lib/receipt.ts web/packages/app/src/app/api/gateway/_lib/__tests__/receipt.test.ts
git commit -m "feat: gateway receipt encode + EIP-191 sign"
```

---

## Task 13: Gateway — registry chain reader

**Files:**
- Create: `web/packages/app/src/app/api/gateway/_lib/registry.ts`
- Create: `web/packages/app/src/app/api/gateway/_lib/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing tests**

Write `web/packages/app/src/app/api/gateway/_lib/__tests__/registry.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { readRegistry } from '../registry'

function makeMockClient(textReturns: Record<string, string>) {
  return {
    readContract: vi.fn(async ({ args }: { args: readonly unknown[] }) => {
      const key = args[1] as string
      return textReturns[key] ?? ''
    }),
  } as unknown as Parameters<typeof readRegistry>[0]['client']
}

const RESOLVER = '0x0000000000000000000000000000000000000001' as const
const NODE = '0xabababababababababababababababababababababababababababababababab' as const

describe('readRegistry', () => {
  it('returns parsed root and configured domain', async () => {
    const client = makeMockClient({
      'bordel.member-root':
        '0x' + '11'.repeat(32),
      'bordel.challenge-domain': 'BORDEL_AUTH_V2',
    })
    const r = await readRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    expect(r.memberRoot).toBe('0x' + '11'.repeat(32))
    expect(r.challengeDomain).toBe('BORDEL_AUTH_V2')
  })

  it('returns empty domain when unset (caller falls back to default)', async () => {
    const client = makeMockClient({
      'bordel.member-root': '0x' + '22'.repeat(32),
    })
    const r = await readRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    expect(r.challengeDomain).toBe('')
  })

  it('throws when member-root is unset', async () => {
    const client = makeMockClient({})
    await expect(
      readRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    ).rejects.toThrow(/member-root/)
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `cd web/packages/app && npm test -- registry.test.ts`

- [ ] **Step 3: Implement `registry.ts`**

Write `web/packages/app/src/app/api/gateway/_lib/registry.ts`:

```ts
import type { Address, Hex, PublicClient } from 'viem'

export const RESOLVER_ABI = [
  {
    name: 'text',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export interface RegistryReadInput {
  client: Pick<PublicClient, 'readContract'>
  resolver: Address
  bordelNode: Hex
}

export interface RegistryView {
  memberRoot: Hex
  challengeDomain: string
}

async function readText(input: RegistryReadInput, key: string): Promise<string> {
  return (await input.client.readContract({
    address: input.resolver,
    abi: RESOLVER_ABI,
    functionName: 'text',
    args: [input.bordelNode, key],
  })) as string
}

export async function readRegistry(input: RegistryReadInput): Promise<RegistryView> {
  const [memberRoot, challengeDomain] = await Promise.all([
    readText(input, 'bordel.member-root'),
    readText(input, 'bordel.challenge-domain'),
  ])
  if (!memberRoot) throw new Error('registry: bordel.member-root is unset')
  return { memberRoot: memberRoot as Hex, challengeDomain }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/app && npm test -- registry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add web/packages/app/src/app/api/gateway/_lib/registry.ts web/packages/app/src/app/api/gateway/_lib/__tests__/registry.test.ts
git commit -m "feat: gateway registry reader (live config from chain)"
```

---

## Task 14: Gateway — DB and verifier stubs

**Files:**
- Create: `web/packages/app/src/app/api/gateway/_lib/db.ts`
- Create: `web/packages/app/src/app/api/gateway/_lib/verify.ts`

These are deliberately minimal. Real implementations land with the parent spec's circuit + DB work.

- [ ] **Step 1: Write the DB stub**

Write `web/packages/app/src/app/api/gateway/_lib/db.ts`:

```ts
import type { Address, Hex } from 'viem'

export interface MemberRecord {
  name: string
  leaf: Hex
  address: Address
  capabilities: string[]
}

const FIXTURES: Record<string, MemberRecord> = {
  'skas.bordel.eth': {
    name: 'skas.bordel.eth',
    leaf: '0x' + '00'.repeat(32) as Hex,
    address: '0x000000000000000000000000000000000000beef',
    capabilities: ['door', 'gym', 'kitchen'],
  },
}

export function lookupMember(name: string): MemberRecord | undefined {
  // door.skas.bordel.eth → strip the capability label, member is skas.bordel.eth
  const parts = name.split('.')
  if (parts.length < 4) return undefined
  const memberName = parts.slice(1).join('.')
  return FIXTURES[memberName]
}

export function capabilityOf(name: string): string {
  // First label is the capability for door.skas.bordel.eth → 'door'.
  const parts = name.split('.')
  return parts[0]
}
```

- [ ] **Step 2: Write the verifier stub**

Write `web/packages/app/src/app/api/gateway/_lib/verify.ts`:

```ts
import type { Hex } from 'viem'

export interface PublicInputs {
  challenge: Hex
  root: Hex
  leaf: Hex
}

/**
 * Real implementation lands with circuit work in the parent spec.
 * For now: trust the publicInputs; gateway logic can be exercised end-to-end.
 */
export async function verifyProof(_proof: Hex, _publicInputs: PublicInputs): Promise<boolean> {
  return true
}
```

- [ ] **Step 3: Confirm typecheck passes**

Run: `cd web/packages/app && npx tsc --noEmit`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add web/packages/app/src/app/api/gateway/_lib/db.ts web/packages/app/src/app/api/gateway/_lib/verify.ts
git commit -m "feat: gateway DB + verifier stubs"
```

---

## Task 15: Gateway — `lookup` route handler

**Files:**
- Create: `web/packages/app/src/app/api/gateway/lookup/route.ts`
- Create: `web/packages/app/src/app/api/gateway/lookup/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Write `web/packages/app/src/app/api/gateway/lookup/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { type Hex, keccak256, recoverAddress, hashMessage, decodeAbiParameters } from 'viem'
import { computeChallenge, DEFAULT_CHALLENGE_DOMAIN } from '../../_lib/challenge'
import { RECEIPT_ABI } from '../../_lib/receipt'

const ACCOUNT = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const NODE = '0xabababababababababababababababababababababababababababababababab' as const
const NONCE = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd' as const
const ROOT = ('0x' + '11'.repeat(32)) as Hex
const SKAS_LEAF = ('0x' + '00'.repeat(32)) as Hex

vi.mock('../../_lib/registry', () => ({
  readRegistry: vi.fn(async () => ({ memberRoot: ROOT, challengeDomain: '' })),
}))

vi.mock('../../_lib/sign-config', () => ({
  getSignerAccount: () => ACCOUNT,
}))

vi.mock('../../_lib/chain-config', () => ({
  getReadClient: () => ({}),
  getResolverAddress: () => '0x0000000000000000000000000000000000000001' as const,
  getBordelNode: () => NODE,
  getCurrentBlock: async () => ({ number: 100n, hash: ('0x' + '22'.repeat(32)) as Hex }),
}))

import { POST } from '../route'

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'door.skas.bordel.eth',
    node: NODE,
    selector: '0x3b3b57de',
    selectorArgs: [],
    nonce: NONCE,
    proof: '0xdeadbeef',
    publicInputs: {
      challenge: computeChallenge({ domain: DEFAULT_CHALLENGE_DOMAIN, nonce: NONCE, node: NODE }),
      root: ROOT,
      leaf: SKAS_LEAF,
    },
    ...overrides,
  }
}

async function callPost(body: unknown) {
  return POST(new Request('http://test/api/gateway/lookup', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
}

describe('POST /api/gateway/lookup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path → 200 with signed receipt', async () => {
    const res = await callPost(makeBody())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { receipt: Hex; signature: Hex }
    expect(json.receipt).toMatch(/^0x[0-9a-f]+$/i)
    expect(json.signature).toMatch(/^0x[0-9a-f]+$/i)

    // Verify signer
    const recovered = await recoverAddress({
      hash: hashMessage({ raw: keccak256(json.receipt) }),
      signature: json.signature,
    })
    expect(recovered.toLowerCase()).toBe(ACCOUNT.address.toLowerCase())

    // Verify decoded receipt fields
    const [decoded] = decodeAbiParameters(RECEIPT_ABI, json.receipt) as [
      { node: Hex; value: Hex; signedRoot: Hex; blockNum: bigint; blockHash: Hex },
    ]
    expect(decoded.node).toBe(NODE)
    expect(decoded.signedRoot).toBe(ROOT)
    expect(decoded.blockNum).toBe(100n)
  })

  it('challenge mismatch → 400', async () => {
    const body = makeBody({
      publicInputs: {
        challenge: '0x' + 'ff'.repeat(32),
        root: ROOT,
        leaf: SKAS_LEAF,
      },
    })
    const res = await callPost(body)
    expect(res.status).toBe(400)
  })

  it('root mismatch → 403', async () => {
    const body = makeBody({
      publicInputs: {
        challenge: computeChallenge({ domain: DEFAULT_CHALLENGE_DOMAIN, nonce: NONCE, node: NODE }),
        root: '0x' + 'ee'.repeat(32),
        leaf: SKAS_LEAF,
      },
    })
    const res = await callPost(body)
    expect(res.status).toBe(403)
  })

  it('leaf not in DB → 404', async () => {
    const body = makeBody({
      name: 'door.unknown.bordel.eth',
      publicInputs: {
        challenge: computeChallenge({ domain: DEFAULT_CHALLENGE_DOMAIN, nonce: NONCE, node: NODE }),
        root: ROOT,
        leaf: '0x' + 'aa'.repeat(32),
      },
    })
    const res = await callPost(body)
    expect(res.status).toBe(404)
  })

  it('member lacks capability → 403', async () => {
    const body = makeBody({
      name: 'lounge.skas.bordel.eth',
    })
    const res = await callPost(body)
    expect(res.status).toBe(403)
  })

  it('domain configured on chain → request must use it', async () => {
    const { readRegistry } = await import('../../_lib/registry')
    vi.mocked(readRegistry).mockResolvedValueOnce({
      memberRoot: ROOT,
      challengeDomain: 'BORDEL_AUTH_V2',
    })
    const body = makeBody({
      publicInputs: {
        challenge: computeChallenge({ domain: 'BORDEL_AUTH_V2', nonce: NONCE, node: NODE }),
        root: ROOT,
        leaf: SKAS_LEAF,
      },
    })
    const res = await callPost(body)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run — expect fail (route not found)**

Run: `cd web/packages/app && npm test -- route.test.ts`

- [ ] **Step 3: Create the small config helpers the route imports**

Write `web/packages/app/src/app/api/gateway/_lib/sign-config.ts`:

```ts
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { Hex } from 'viem'

export function getSignerAccount(): PrivateKeyAccount {
  const key = process.env.BORDEL_GATEWAY_SIGNER_KEY
  if (!key) throw new Error('BORDEL_GATEWAY_SIGNER_KEY is not set')
  return privateKeyToAccount(key as Hex)
}
```

Write `web/packages/app/src/app/api/gateway/_lib/chain-config.ts`:

```ts
import { createPublicClient, http, type Address, type Hex, type PublicClient } from 'viem'
import { sepolia } from 'viem/chains'

export function getReadClient(): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(process.env.BORDEL_RPC_URL),
  })
}

export function getResolverAddress(): Address {
  const a = process.env.BORDEL_RESOLVER
  if (!a) throw new Error('BORDEL_RESOLVER is not set')
  return a as Address
}

export function getBordelNode(): Hex {
  const n = process.env.BORDEL_NODE
  if (!n) throw new Error('BORDEL_NODE is not set')
  return n as Hex
}

export async function getCurrentBlock(): Promise<{ number: bigint; hash: Hex }> {
  const client = getReadClient()
  const block = await client.getBlock({ blockTag: 'latest' })
  return { number: block.number - 1n, hash: block.hash as Hex }
}
```

- [ ] **Step 4: Implement the route**

Write `web/packages/app/src/app/api/gateway/lookup/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { encodeAbiParameters, type Hex } from 'viem'
import { computeChallenge } from '../_lib/challenge'
import { encodeReceipt, signReceipt, type Receipt } from '../_lib/receipt'
import { readRegistry } from '../_lib/registry'
import { getSignerAccount } from '../_lib/sign-config'
import {
  getReadClient,
  getResolverAddress,
  getBordelNode,
  getCurrentBlock,
} from '../_lib/chain-config'
import { lookupMember, capabilityOf } from '../_lib/db'
import { verifyProof } from '../_lib/verify'

interface LookupBody {
  name: string
  node: Hex
  selector: Hex
  selectorArgs: string[]
  nonce: Hex
  proof: Hex
  publicInputs: {
    challenge: Hex
    root: Hex
    leaf: Hex
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as LookupBody

  const registry = await readRegistry({
    client: getReadClient(),
    resolver: getResolverAddress(),
    bordelNode: getBordelNode(),
  })

  // 1. Challenge construction must match live config.
  const expected = computeChallenge({
    domain: registry.challengeDomain,
    nonce: body.nonce,
    node: body.node,
  })
  if (expected !== body.publicInputs.challenge) {
    return NextResponse.json({ error: 'challenge-mismatch' }, { status: 400 })
  }

  // 2. Root must match current chain root.
  if (body.publicInputs.root !== registry.memberRoot) {
    return NextResponse.json({ error: 'stale-root' }, { status: 403 })
  }

  // 3. Member must exist in DB and own the leaf.
  const member = lookupMember(body.name)
  if (!member) {
    return NextResponse.json({ error: 'unknown-member' }, { status: 404 })
  }
  if (member.leaf !== body.publicInputs.leaf) {
    return NextResponse.json({ error: 'leaf-mismatch' }, { status: 403 })
  }

  // 4. Capability check.
  const cap = capabilityOf(body.name)
  if (!member.capabilities.includes(cap)) {
    return NextResponse.json({ error: 'no-capability' }, { status: 403 })
  }

  // 5. Proof must verify (stub for v1).
  const ok = await verifyProof(body.proof, body.publicInputs)
  if (!ok) {
    return NextResponse.json({ error: 'bad-proof' }, { status: 400 })
  }

  // 6. Build and sign receipt.
  const block = await getCurrentBlock()
  const receipt: Receipt = {
    node: body.node,
    value: encodeAbiParameters([{ type: 'address' }], [member.address]),
    signedRoot: registry.memberRoot,
    blockNum: block.number,
    blockHash: block.hash,
  }
  const signer = getSignerAccount()
  const signature = await signReceipt(signer, receipt)

  return NextResponse.json({
    receipt: encodeReceipt(receipt),
    signature,
  })
}
```

- [ ] **Step 5: Set the test env so signer/resolver helpers don't blow up**

Update `web/packages/app/vitest.config.ts` to set required env vars:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    env: {
      BORDEL_GATEWAY_SIGNER_KEY:
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      BORDEL_RESOLVER: '0x0000000000000000000000000000000000000001',
      BORDEL_NODE:
        '0xabababababababababababababababababababababababababababababababab',
      BORDEL_RPC_URL: 'http://localhost:1',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
```

- [ ] **Step 6: Run — expect pass**

Run: `cd web/packages/app && npm test -- route.test.ts`
Expected: 6/6 pass.

- [ ] **Step 7: Commit**

```bash
git add web/packages/app/src/app/api/gateway/lookup/route.ts web/packages/app/src/app/api/gateway/lookup/__tests__/route.test.ts web/packages/app/src/app/api/gateway/_lib/sign-config.ts web/packages/app/src/app/api/gateway/_lib/chain-config.ts web/packages/app/vitest.config.ts
git commit -m "feat: gateway lookup route + chain/sign config"
```

---

## Task 16: Wallet — registry reader

**Files:**
- Create: `web/packages/app/src/utils/bordel/registry.ts`
- Create: `web/packages/app/src/utils/bordel/__tests__/registry.test.ts`

The wallet reads the same text records the gateway does, by calling `text(BORDEL_NODE, key)` directly on the resolver (parent reads = direct storage in the resolver, no CCIP-Read).

- [ ] **Step 1: Write failing tests**

Write `web/packages/app/src/utils/bordel/__tests__/registry.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { readWalletRegistry } from '../registry'

const RESOLVER = '0x0000000000000000000000000000000000000001' as const
const NODE = '0xabababababababababababababababababababababababababababababababab' as const

function makeClient(values: Record<string, string>) {
  return {
    readContract: vi.fn(async ({ args }: { args: readonly unknown[] }) => {
      const key = args[1] as string
      return values[key] ?? ''
    }),
  } as unknown as Parameters<typeof readWalletRegistry>[0]['client']
}

describe('readWalletRegistry', () => {
  it('returns memberRoot and challengeDomain', async () => {
    const client = makeClient({
      'bordel.member-root': '0x' + '33'.repeat(32),
      'bordel.challenge-domain': 'BORDEL_AUTH_V2',
    })
    const r = await readWalletRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    expect(r.memberRoot).toBe('0x' + '33'.repeat(32))
    expect(r.challengeDomain).toBe('BORDEL_AUTH_V2')
  })

  it('throws when memberRoot is unset', async () => {
    const client = makeClient({})
    await expect(
      readWalletRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    ).rejects.toThrow(/member-root/)
  })

  it('returns empty challengeDomain when unset (caller falls back)', async () => {
    const client = makeClient({ 'bordel.member-root': '0x' + '44'.repeat(32) })
    const r = await readWalletRegistry({ client, resolver: RESOLVER, bordelNode: NODE })
    expect(r.challengeDomain).toBe('')
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `cd web/packages/app && npm test -- registry.test.ts`

- [ ] **Step 3: Implement `registry.ts`**

Write `web/packages/app/src/utils/bordel/registry.ts`:

```ts
import type { Address, Hex, PublicClient } from 'viem'

const TEXT_ABI = [
  {
    name: 'text',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export interface WalletRegistryInput {
  client: Pick<PublicClient, 'readContract'>
  resolver: Address
  bordelNode: Hex
}

export interface WalletRegistry {
  memberRoot: Hex
  challengeDomain: string
}

async function text(input: WalletRegistryInput, key: string): Promise<string> {
  return (await input.client.readContract({
    address: input.resolver,
    abi: TEXT_ABI,
    functionName: 'text',
    args: [input.bordelNode, key],
  })) as string
}

export async function readWalletRegistry(input: WalletRegistryInput): Promise<WalletRegistry> {
  const [memberRoot, challengeDomain] = await Promise.all([
    text(input, 'bordel.member-root'),
    text(input, 'bordel.challenge-domain'),
  ])
  if (!memberRoot) throw new Error('wallet-registry: bordel.member-root is unset')
  return { memberRoot: memberRoot as Hex, challengeDomain }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/app && npm test -- src/utils/bordel/__tests__/registry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add web/packages/app/src/utils/bordel/registry.ts web/packages/app/src/utils/bordel/__tests__/registry.test.ts
git commit -m "feat: wallet-side registry reader"
```

---

## Task 17: Wallet — challenge construction helper

**Files:**
- Create: `web/packages/app/src/utils/bordel/challenge.ts`
- Create: `web/packages/app/src/utils/bordel/__tests__/challenge.test.ts`

The wallet reuses the same algorithm as the gateway. To keep them in sync we use a single test fixture that both sides verify against.

- [ ] **Step 1: Write the failing test**

Write `web/packages/app/src/utils/bordel/__tests__/challenge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeChallenge as gatewayChallenge, DEFAULT_CHALLENGE_DOMAIN } from '@/app/api/gateway/_lib/challenge'
import { buildChallenge } from '../challenge'

const node = '0xabababababababababababababababababababababababababababababababab' as const
const nonce = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd' as const

describe('buildChallenge', () => {
  it('matches the gateway algorithm with default domain', () => {
    const w = buildChallenge({ domain: '', nonce, node })
    const g = gatewayChallenge({ domain: DEFAULT_CHALLENGE_DOMAIN, nonce, node })
    expect(w).toBe(g)
  })

  it('matches the gateway algorithm with custom domain', () => {
    const w = buildChallenge({ domain: 'BORDEL_AUTH_V2', nonce, node })
    const g = gatewayChallenge({ domain: 'BORDEL_AUTH_V2', nonce, node })
    expect(w).toBe(g)
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `cd web/packages/app && npm test -- src/utils/bordel/__tests__/challenge.test.ts`

- [ ] **Step 3: Implement `challenge.ts`**

The wallet helper just wraps the same module the gateway uses; sharing one implementation keeps them honest.

Write `web/packages/app/src/utils/bordel/challenge.ts`:

```ts
import type { Hex } from 'viem'
import {
  computeChallenge,
  DEFAULT_CHALLENGE_DOMAIN,
} from '@/app/api/gateway/_lib/challenge'

export interface BuildChallengeInput {
  domain: string
  nonce: Hex
  node: Hex
}

export function buildChallenge(input: BuildChallengeInput): Hex {
  return computeChallenge(input)
}

export { DEFAULT_CHALLENGE_DOMAIN }
```

- [ ] **Step 4: Run — expect pass**

Run: `cd web/packages/app && npm test -- src/utils/bordel/__tests__/challenge.test.ts`

- [ ] **Step 5: Run the full suite end-to-end**

Run: `cd web/packages/app && npm test`
Expected: all tests across both packages pass.

Run: `cd web/packages/foundry && forge test`
Expected: all Forge tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/packages/app/src/utils/bordel/challenge.ts web/packages/app/src/utils/bordel/__tests__/challenge.test.ts
git commit -m "feat: wallet challenge helper sharing the gateway algorithm"
```

---

## Done

What's covered:
- Registry text-record schema (`bordel.member-root`, `bordel.gateway-signer`, `bordel.freshness-window`, `bordel.gateway-url.N`, `bordel.challenge-domain`) — read live by the resolver and gateway.
- `BordelResolver`: `text`/`setText`, `addr`/`setAddr`, ENSIP-10 `resolve()` for parent (direct) and subname (`OffchainLookup`), `resolveWithProof()` with sig + freshness + blockhash + node + root checks, `supportsInterface`, deploy script.
- Gateway: challenge construction module, receipt encode + EIP-191 sign, registry reader, lookup route handler with all the addendum-spec failure modes (400 / 403 / 404), DB + verifier stubs.
- Wallet helpers: registry reader, challenge builder sharing the gateway implementation.

What's deferred (parent-spec scope):
- Real Noir proof verification (`verify.ts` is a stub).
- Real member DB (`db.ts` has hardcoded fixtures).
- Multi-gateway signer-key topology choice and member-set shared store.
- Playwright E2E tests against a live Sepolia + circuit.
- Sepolia ENSv2 registration of `bordel.eth` and on-chain wiring of the resolver.
