// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IENS} from "../../src/interfaces/IENS.sol";

contract MockENS is IENS {
    mapping(bytes32 => address) public owners;
    mapping(address => mapping(address => bool)) public approvals;

    function setOwner(bytes32 node, address who) external {
        owners[node] = who;
    }

    function setApprovalForAll(address operator, bool approved) external {
        approvals[msg.sender][operator] = approved;
    }

    function owner(bytes32 node) external view returns (address) {
        return owners[node];
    }

    function isApprovedForAll(address ownerAddr, address operator) external view returns (bool) {
        return approvals[ownerAddr][operator];
    }
}
