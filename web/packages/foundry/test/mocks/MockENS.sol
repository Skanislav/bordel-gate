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
