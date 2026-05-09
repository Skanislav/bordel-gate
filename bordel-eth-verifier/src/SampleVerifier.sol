// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IVerifier} from "./interfaces.sol";

contract SampleVerifier {
    /// @dev ecdsa-verifier address
    IVerifier public verifier;

    constructor(IVerifier _verifier) {
        verifier = IVerifier(_verifier);
    }

    function verify(bytes memory proof, bytes32[] memory publicInputs) public view returns (bool) {
        return verifier.verify(proof, publicInputs);
    }
}
