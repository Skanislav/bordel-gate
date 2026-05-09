// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBordelResolver {
    struct Receipt {
        bytes32 node;
        bytes value;
        bytes32 signedRoot;
        uint64 blockNum;
        bytes32 blockHash;
    }

    error ParameterMissing(string key);
    error NoGatewayConfigured();
    error UnsupportedSelector(bytes4 selector);
    error NotAuthorized();
    error BadSignature();
    error NodeMismatch();
    error StaleRoot();
    error StaleBlock();
    error ReorgedBlock();
    error MalformedHex(string field);

    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    event AddrChanged(bytes32 indexed node, address newAddress);
    event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value);
}
