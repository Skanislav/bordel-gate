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
}
