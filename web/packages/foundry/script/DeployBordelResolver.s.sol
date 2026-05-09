// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BordelResolver.sol";

contract DeployBordelResolver is Script {
    function run() external {
        bytes32 parentNode = vm.envBytes32("BORDEL_PARENT_NODE");
        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        BordelResolver resolver = new BordelResolver(parentNode);
        vm.stopBroadcast();
        console2.log("BordelResolver deployed at:", address(resolver));
    }
}
