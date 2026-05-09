// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {SampleVerifier} from "../src/SampleVerifier.sol";
import {IVerifier} from "../src/interfaces.sol";
import {HonkVerifier} from "../src/circuits/Verifier.sol";

contract SampleVerifierScript is Script {
    SampleVerifier public sampleVerifier;

    function setUp() public {}

    function deployVerifier() public returns (address) {
        HonkVerifier verifier = new HonkVerifier();
        return address(verifier);
    }

    function run() public {
        vm.startBroadcast();

        address verifier = vm.envAddress("VERIFIER_ADDRESS");

        sampleVerifier = new SampleVerifier(IVerifier(verifier));

        vm.stopBroadcast();
    }
}
