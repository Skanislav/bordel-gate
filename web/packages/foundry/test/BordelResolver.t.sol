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
}
