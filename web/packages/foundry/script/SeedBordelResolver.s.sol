// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BordelResolver.sol";

/// @notice Populates the four parent text records on a deployed BordelResolver.
///         Intended for local anvil bring-up; on Sepolia/mainnet the same
///         records are written by the bordel.eth owner via ENS UI or cast.
contract SeedBordelResolver is Script {
    function run() external {
        address resolverAddr = vm.envAddress("BORDEL_RESOLVER_ADDRESS");
        bytes32 parentNode = vm.envBytes32("BORDEL_PARENT_NODE");
        uint256 pk = vm.envUint("DEPLOYER_PK");

        string memory root = vm.envString("BORDEL_MEMBER_ROOT");
        string memory signer = vm.envString("BORDEL_GATEWAY_SIGNER");
        string memory freshness = vm.envString("BORDEL_FRESHNESS_WINDOW");
        string memory url = vm.envString("BORDEL_GATEWAY_URL");

        BordelResolver resolver = BordelResolver(resolverAddr);

        vm.startBroadcast(pk);
        resolver.setText(parentNode, "bordel.member-root", root);
        resolver.setText(parentNode, "bordel.gateway-signer", signer);
        resolver.setText(parentNode, "bordel.freshness-window", freshness);
        resolver.setText(parentNode, "bordel.gateway-url", url);
        vm.stopBroadcast();

        console2.log("Seeded BordelResolver at:", resolverAddr);
        console2.log("  bordel.member-root      =", root);
        console2.log("  bordel.gateway-signer   =", signer);
        console2.log("  bordel.freshness-window =", freshness);
        console2.log("  bordel.gateway-url      =", url);
    }
}
