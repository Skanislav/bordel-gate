// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INameWrapper {
    function ownerOf(uint256 id) external view returns (address);
    function isApprovedForAll(address account, address operator) external view returns (bool);
}
