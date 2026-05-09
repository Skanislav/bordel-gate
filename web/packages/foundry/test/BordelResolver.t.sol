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
    event AddrChanged(bytes32 indexed node, address newAddress);

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

    // ── Hex parser helpers ────────────────────────────────────────────────

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

    // ── memberRoot tests ──────────────────────────────────────────────────

    function test_memberRoot_unset_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(IBordelResolver.ParameterMissing.selector, "member-root"));
        resolver.memberRoot();
    }

    function test_memberRoot_set_returnsParsedValue() public {
        bytes32 r = bytes32(uint256(0x1122334455667788990011223344556677889900112233445566778899001122));
        _setRoot(r);
        assertEq(resolver.memberRoot(), r);
    }

    // ── gatewaySigner tests ───────────────────────────────────────────────

    function test_gatewaySigner_unset_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(IBordelResolver.ParameterMissing.selector, "gateway-signer"));
        resolver.gatewaySigner();
    }

    function test_gatewaySigner_set_returnsParsedValue() public {
        address s = address(0xCAFe0000000000000000000000000000DEADBeEF);
        _setSigner(s);
        assertEq(resolver.gatewaySigner(), s);
    }

    // ── freshnessWindow tests ─────────────────────────────────────────────

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

    // ── malformed input tests ─────────────────────────────────────────────

    function test_memberRoot_malformed_reverts() public {
        vm.prank(owner);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "not-hex");
        vm.expectRevert(abi.encodeWithSelector(IBordelResolver.MalformedHex.selector, "member-root"));
        resolver.memberRoot();
    }
}
