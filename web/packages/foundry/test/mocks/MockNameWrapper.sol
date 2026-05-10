// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {INameWrapper} from "../../src/interfaces/INameWrapper.sol";

contract MockNameWrapper is INameWrapper {
    mapping(uint256 => address) public ownerOfMap;
    mapping(address => mapping(address => bool)) public approvals;

    function setOwner(uint256 id, address who) external {
        ownerOfMap[id] = who;
    }

    function setApprovalForAll(address operator, bool approved) external {
        approvals[msg.sender][operator] = approved;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return ownerOfMap[id];
    }

    function isApprovedForAll(address account, address operator) external view returns (bool) {
        return approvals[account][operator];
    }
}
