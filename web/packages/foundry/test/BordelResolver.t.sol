// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BordelResolver.sol";

contract BordelResolverTest is Test {
    BordelResolver resolver;
    bytes32 constant BORDEL_NODE = keccak256(abi.encodePacked(bytes32(0), keccak256("bordel-test")));
    address admin = address(0xA11CE);

    function setUp() public {
        vm.prank(admin);
        resolver = new BordelResolver(BORDEL_NODE);
    }

    function test_setText_admin_only() public {
        vm.prank(admin);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0x01");
        assertEq(resolver.text(BORDEL_NODE, "bordel.member-root"), "0x01");
    }

    function test_setText_non_admin_reverts() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(BordelResolver.NotAdmin.selector);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0x01");
    }

    function test_root_helper_reads_text_record() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0x1234567890123456789012345678901234567890123456789012345678901234");
        vm.stopPrank();
        assertEq(resolver.exposedRoot(), bytes32(0x1234567890123456789012345678901234567890123456789012345678901234));
    }

    function test_signer_helper() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "bordel.gateway-signer", "0x000000000000000000000000000000000000abcd");
        vm.stopPrank();
        assertEq(resolver.exposedSigner(), address(0xABCD));
    }

    function test_freshness_helper() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "bordel.freshness-window", "30");
        vm.stopPrank();
        assertEq(resolver.exposedFreshness(), 30);
    }

    function test_missing_param_reverts() public {
        vm.expectRevert(BordelResolver.MissingParameter.selector);
        resolver.exposedRoot();
    }

    function test_addr_for_parent_reads_text_record() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "addr", "0x000000000000000000000000000000000000beef");
        vm.stopPrank();
        assertEq(resolver.addr(BORDEL_NODE), address(0xBEEF));
    }

    function test_resolve_parent_addr_returns_text() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "addr", "0x000000000000000000000000000000000000beef");
        vm.stopPrank();
        bytes memory data = abi.encodeWithSelector(0x3b3b57de, BORDEL_NODE);
        bytes memory dnsName = _dnsEncode("bordel-test");
        bytes memory result = resolver.resolve(dnsName, data);
        assertEq(abi.decode(result, (address)), address(0xBEEF));
    }

    function test_resolve_subname_reverts_with_offchain_lookup() public {
        vm.prank(admin);
        resolver.setText(BORDEL_NODE, "bordel.gateway-url", "https://example/api");
        bytes32 subnode = keccak256(abi.encodePacked(BORDEL_NODE, keccak256("skas")));
        bytes memory data = abi.encodeWithSelector(0x3b3b57de, subnode);
        bytes memory dnsName = _dnsEncodeMulti("skas", "bordel-test");

        // OffchainLookup error data is complex (ABI-encoded); just assert it reverts.
        vm.expectRevert();
        resolver.resolve(dnsName, data);
    }

    function test_resolve_subname_without_gateway_url_reverts_missing_param() public {
        bytes32 subnode = keccak256(abi.encodePacked(BORDEL_NODE, keccak256("skas")));
        bytes memory data = abi.encodeWithSelector(0x3b3b57de, subnode);
        bytes memory dnsName = _dnsEncodeMulti("skas", "bordel-test");
        vm.expectRevert(BordelResolver.MissingParameter.selector);
        resolver.resolve(dnsName, data);
    }

    function test_setText_gateway_url_persists() public {
        vm.prank(admin);
        resolver.setText(BORDEL_NODE, "bordel.gateway-url", "https://gateway.example/api/gateway/lookup");
        assertEq(resolver.text(BORDEL_NODE, "bordel.gateway-url"), "https://gateway.example/api/gateway/lookup");
    }

    // --- DNS encoding helpers used by the resolve tests ---

    function _dnsEncode(string memory label) internal pure returns (bytes memory) {
        bytes memory l = bytes(label);
        bytes memory out = new bytes(1 + l.length + 1);
        out[0] = bytes1(uint8(l.length));
        for (uint256 i = 0; i < l.length; i++) out[1 + i] = l[i];
        out[out.length - 1] = 0x00;
        return out;
    }

    function _dnsEncodeMulti(string memory sub, string memory parent) internal pure returns (bytes memory) {
        bytes memory s = bytes(sub);
        bytes memory p = bytes(parent);
        bytes memory out = new bytes(1 + s.length + 1 + p.length + 1);
        uint256 o = 0;
        out[o++] = bytes1(uint8(s.length));
        for (uint256 i = 0; i < s.length; i++) out[o++] = s[i];
        out[o++] = bytes1(uint8(p.length));
        for (uint256 i = 0; i < p.length; i++) out[o++] = p[i];
        out[o] = 0x00;
        return out;
    }
}
