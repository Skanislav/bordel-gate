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

    // ── gatewayUrls tests ─────────────────────────────────────────────────

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

    // ── resolve() tests ───────────────────────────────────────────────────

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
}
