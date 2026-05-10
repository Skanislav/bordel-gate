// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library EIP712Receipt {
    // EIP-712 domain: name="BordelGateway", version="1", chainId, verifyingContract=resolver
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant NAME_HASH = keccak256("BordelGateway");
    bytes32 internal constant VERSION_HASH = keccak256("1");

    // Receipt(node, value, signedRoot, blockNum, blockHash)
    bytes32 internal constant RECEIPT_TYPEHASH =
        keccak256("Receipt(bytes32 node,bytes value,bytes32 signedRoot,uint64 blockNum,bytes32 blockHash)");

    function domainSeparator(address verifyingContract) internal view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            NAME_HASH,
            VERSION_HASH,
            block.chainid,
            verifyingContract
        ));
    }

    function hashReceipt(
        bytes32 node,
        bytes memory value,
        bytes32 signedRoot,
        uint64 blockNum,
        bytes32 blockHash
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            RECEIPT_TYPEHASH,
            node,
            keccak256(value),
            signedRoot,
            blockNum,
            blockHash
        ));
    }

    function digest(
        address verifyingContract,
        bytes32 node,
        bytes memory value,
        bytes32 signedRoot,
        uint64 blockNum,
        bytes32 blockHash
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator(verifyingContract),
            hashReceipt(node, value, signedRoot, blockNum, blockHash)
        ));
    }
}
