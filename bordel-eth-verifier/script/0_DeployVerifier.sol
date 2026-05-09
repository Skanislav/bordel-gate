// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {HonkVerifier} from "../src/validators/EcdsaValidator.sol";

contract DeployEcdsaValidatorScript is Script {

    function setUp() public {}

    function deployEcdsaValidator() public returns (address) {
        HonkVerifier verifier = new HonkVerifier();
        return address(verifier);
    }

    function run() public {
        vm.startBroadcast();

        address verifier = deployEcdsaValidator();
        console.log("Verifier deployed at:", verifier);

        vm.stopBroadcast();
    }
}
