// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {BordelResolver} from "../src/BordelResolver.sol";
import {IENS} from "../src/interfaces/IENS.sol";
import {INameWrapper} from "../src/interfaces/INameWrapper.sol";

contract DeployBordelResolver is Script {
    function run() external {
        address ensAddr = vm.envAddress("ENS_REGISTRY");
        address nameWrapperAddr = vm.envOr("NAME_WRAPPER", address(0));
        bytes32 bordelNode = vm.envBytes32("BORDEL_NODE");

        vm.startBroadcast();
        BordelResolver resolver = new BordelResolver(
            IENS(ensAddr),
            INameWrapper(nameWrapperAddr),
            bordelNode
        );
        vm.stopBroadcast();

        console.log("BordelResolver deployed at:", address(resolver));
    }
}
