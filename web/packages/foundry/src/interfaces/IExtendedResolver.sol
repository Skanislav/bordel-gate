// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ENSIP-10 wildcard resolution, with CCIP-Read for offchain data.
interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

/// @notice ERC-3668 OffchainLookup error.
error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);
