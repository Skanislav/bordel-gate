
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

interface IVerifier {
    function verify(bytes memory proof, bytes32[] memory publicInputs) external view returns (bool);
}