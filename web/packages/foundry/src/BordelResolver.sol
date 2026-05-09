// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IExtendedResolver.sol";

/// @title BordelResolver
/// @notice ENS resolver for bordel.eth and *.bordel.eth.
///         Parent name uses standard ERC-634 text records.
///         Subnames use CCIP-Read against an offchain gateway (wired in later tasks).
contract BordelResolver {
    error NotAdmin();
    error MissingParameter();
    error InvalidSignature();
    error StaleRoot();
    error StaleBlock();
    error BlockHashMismatch();
    error NodeMismatch();

    bytes32 public immutable bordelNode;
    address public admin;

    // node -> key -> value (ENS standard text records)
    mapping(bytes32 => mapping(string => string)) private _texts;

    constructor(bytes32 _bordelNode) {
        bordelNode = _bordelNode;
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function setText(bytes32 node, string calldata key, string calldata value) external onlyAdmin {
        _texts[node][key] = value;
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _texts[node][key];
    }

    // --- Parent-parameter helpers (exposed for testing; internal versions used by resolveWithProof later) ---

    function exposedRoot() external view returns (bytes32) { return _root(); }
    function exposedSigner() external view returns (address) { return _signer(); }
    function exposedFreshness() external view returns (uint64) { return _freshness(); }

    function _root() internal view returns (bytes32) {
        string memory v = _texts[bordelNode]["bordel.member-root"];
        if (bytes(v).length == 0) revert MissingParameter();
        return _parseHex32(v);
    }

    function _signer() internal view returns (address) {
        string memory v = _texts[bordelNode]["bordel.gateway-signer"];
        if (bytes(v).length == 0) revert MissingParameter();
        return address(uint160(uint256(_parseHex32(v))));
    }

    function _freshness() internal view returns (uint64) {
        string memory v = _texts[bordelNode]["bordel.freshness-window"];
        if (bytes(v).length == 0) revert MissingParameter();
        return uint64(_parseUint(v));
    }

    // --- Parsers (ENS text records are strings) ---

    /// @dev Parse a "0x..."-prefixed lower-or-uppercase hex string into a bytes32.
    /// Tolerates short input (zero-pads on the left).
    function _parseHex32(string memory s) internal pure returns (bytes32 out) {
        bytes memory b = bytes(s);
        require(b.length >= 2 && b[0] == "0" && b[1] == "x", "expected 0x-hex");
        uint256 acc;
        for (uint256 i = 2; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            uint256 nib;
            if (c >= 0x30 && c <= 0x39) nib = c - 0x30;
            else if (c >= 0x61 && c <= 0x66) nib = c - 0x61 + 10;
            else if (c >= 0x41 && c <= 0x46) nib = c - 0x41 + 10;
            else revert("bad hex");
            acc = (acc << 4) | nib;
        }
        out = bytes32(acc);
    }

    function _parseUint(string memory s) internal pure returns (uint256 acc) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            require(c >= 0x30 && c <= 0x39, "not a digit");
            acc = acc * 10 + (c - 0x30);
        }
    }

    // --- addr() and resolve() ---

    bytes4 constant ADDR_SELECTOR = 0x3b3b57de; // addr(bytes32)
    bytes4 constant TEXT_SELECTOR = 0x59d1d43c; // text(bytes32,string)

    /// @notice ENS standard addr(bytes32). For the parent name, reads the "addr" text record.
    /// @dev Subname queries should go through `resolve()` which triggers CCIP-Read.
    function addr(bytes32 node) external view returns (address) {
        if (node == bordelNode) {
            string memory v = _texts[node]["addr"];
            if (bytes(v).length == 0) return address(0);
            return address(uint160(uint256(_parseHex32(v))));
        }
        return address(0);
    }

    /// @notice ENSIP-10 entry point. Direct serve for the parent, CCIP-Read revert for subnames.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        bytes32 node = _namehash(name, 0);

        if (node == bordelNode) {
            return _resolveDirect(node, data);
        }

        // Subname: CCIP-Read.
        string memory url = _texts[bordelNode]["bordel.gateway-url"];
        if (bytes(url).length == 0) revert MissingParameter();

        string[] memory urls = new string[](1);
        urls[0] = url;
        revert OffchainLookup(
            address(this),
            urls,
            abi.encode(name, data),
            this.resolveWithProof.selector,
            abi.encode(node, data)
        );
    }

    /// @dev Recursive DNS-name namehash (the standard ENS algorithm).
    function _namehash(bytes calldata name, uint256 offset) internal pure returns (bytes32) {
        if (offset >= name.length || uint8(name[offset]) == 0) {
            return bytes32(0);
        }
        uint256 len = uint8(name[offset]);
        bytes32 child = _namehash(name, offset + 1 + len);
        bytes32 labelHash = keccak256(name[offset + 1 : offset + 1 + len]);
        return keccak256(abi.encodePacked(child, labelHash));
    }

    /// @dev Serve a query against the parent (no offchain hop).
    function _resolveDirect(bytes32 node, bytes calldata data) internal view returns (bytes memory) {
        bytes4 selector = bytes4(data[:4]);
        if (selector == ADDR_SELECTOR) {
            string memory v = _texts[node]["addr"];
            address a = bytes(v).length == 0 ? address(0) : address(uint160(uint256(_parseHex32(v))));
            return abi.encode(a);
        } else if (selector == TEXT_SELECTOR) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            return abi.encode(_texts[node][key]);
        }
        return new bytes(0);
    }

    /// @dev Stub — filled in by P2.T5 (resolveWithProof).
    function resolveWithProof(bytes calldata /*response*/, bytes calldata /*extraData*/)
        external
        pure
        returns (bytes memory)
    {
        revert("not implemented");
    }
}
