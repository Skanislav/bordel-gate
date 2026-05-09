// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IENS {
    function owner(bytes32 node) external view returns (address);
}
