// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IENS} from "./interfaces/IENS.sol";
import {IBordelResolver} from "./interfaces/IBordelResolver.sol";

contract BordelResolver is IBordelResolver {
    IENS public immutable ens;
    bytes32 public immutable bordelNode;

    mapping(bytes32 => mapping(string => string)) private _texts;
    mapping(bytes32 => address) private _addrs;

    constructor(IENS _ens, bytes32 _bordelNode) {
        ens = _ens;
        bordelNode = _bordelNode;
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _texts[node][key];
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        if (ens.owner(node) != msg.sender) revert NotAuthorized();
        _texts[node][key] = value;
        emit TextChanged(node, key, key, value);
    }

    function addr(bytes32 node) external view returns (address) {
        return _addrs[node];
    }

    function setAddr(bytes32 node, address newAddress) external {
        if (ens.owner(node) != msg.sender) revert NotAuthorized();
        _addrs[node] = newAddress;
        emit AddrChanged(node, newAddress);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7  // ERC-165
            || id == bytes4(keccak256("addr(bytes32)"))
            || id == bytes4(keccak256("text(bytes32,string)"))
            || id == bytes4(keccak256("resolve(bytes,bytes)"));
    }

    function resolve(bytes calldata, bytes calldata data) external view returns (bytes memory) {
        bytes4 selector = bytes4(data[0:4]);
        if (selector != bytes4(keccak256("addr(bytes32)"))) revert UnsupportedSelector(selector);
        bytes32 node = abi.decode(data[4:], (bytes32));
        if (node == bordelNode) {
            return abi.encode(_addrs[node]);
        }
        string[] memory urls = gatewayUrls();
        if (urls.length == 0) revert NoGatewayConfigured();
        revert OffchainLookup(
            address(this),
            urls,
            data,
            this.resolveWithProof.selector,
            abi.encode(node)
        );
    }

    function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns (bytes memory) {
        bytes32 expectedNode = abi.decode(extraData, (bytes32));
        (Receipt memory r, bytes memory sig) = abi.decode(response, (Receipt, bytes));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(r))
        ));
        if (_recover(digest, sig) != gatewaySigner()) revert BadSignature();
        if (r.node != expectedNode) revert NodeMismatch();
        if (r.signedRoot != memberRoot()) revert StaleRoot();
        if (block.number - r.blockNum >= freshnessWindow()) revert StaleBlock();
        if (blockhash(r.blockNum) != r.blockHash) revert ReorgedBlock();
        return r.value;
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 sigR;
        bytes32 sigS;
        uint8 v;
        assembly {
            sigR := mload(add(sig, 32))
            sigS := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, sigR, sigS);
    }

    // ── Live-config constants ─────────────────────────────────────────────

    uint256 internal constant DEFAULT_FRESHNESS = 30;
    uint256 internal constant MAX_FRESHNESS = 256;

    // ── Public accessors ──────────────────────────────────────────────────

    function memberRoot() public view returns (bytes32) {
        return _parseBytes32(_texts[bordelNode]["bordel.member-root"], "member-root");
    }

    function gatewaySigner() public view returns (address) {
        return _parseAddress(_texts[bordelNode]["bordel.gateway-signer"], "gateway-signer");
    }

    function freshnessWindow() public view returns (uint256) {
        string memory raw = _texts[bordelNode]["bordel.freshness-window"];
        if (bytes(raw).length == 0) return DEFAULT_FRESHNESS;
        uint256 v = _parseUint(raw, "freshness-window");
        return v > MAX_FRESHNESS ? MAX_FRESHNESS : v;
    }

    function gatewayUrls() public view returns (string[] memory) {
        uint256 count = 0;
        while (bytes(_texts[bordelNode][_urlKey(count)]).length > 0) {
            count++;
        }
        string[] memory urls = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            urls[i] = _texts[bordelNode][_urlKey(i)];
        }
        return urls;
    }

    function _urlKey(uint256 i) internal pure returns (string memory) {
        return string.concat("bordel.gateway-url.", _uintToStr(i));
    }

    function _uintToStr(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory buf = new bytes(d);
        while (v != 0) { d -= 1; buf[d] = bytes1(uint8(0x30 + v % 10)); v /= 10; }
        return string(buf);
    }

    // ── Internal parsers ──────────────────────────────────────────────────

    function _parseBytes32(string memory s, string memory field) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        if (b.length == 0) revert ParameterMissing(field);
        if (b.length != 66 || b[0] != "0" || b[1] != "x") revert MalformedHex(field);
        bytes32 result;
        for (uint256 i = 0; i < 32; i++) {
            uint8 hi = _nibble(b[2 + i*2], field);
            uint8 lo = _nibble(b[3 + i*2], field);
            result |= bytes32(uint256(uint8((hi << 4) | lo)) << (8 * (31 - i)));
        }
        return result;
    }

    function _parseAddress(string memory s, string memory field) internal pure returns (address) {
        bytes memory b = bytes(s);
        if (b.length == 0) revert ParameterMissing(field);
        if (b.length != 42 || b[0] != "0" || b[1] != "x") revert MalformedHex(field);
        uint160 result;
        for (uint256 i = 0; i < 20; i++) {
            uint8 hi = _nibble(b[2 + i*2], field);
            uint8 lo = _nibble(b[3 + i*2], field);
            result = (result << 8) | uint160(uint8((hi << 4) | lo));
        }
        return address(result);
    }

    function _parseUint(string memory s, string memory field) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        if (b.length == 0) revert ParameterMissing(field);
        uint256 result;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c < 0x30 || c > 0x39) revert MalformedHex(field);
            result = result * 10 + (c - 0x30);
        }
        return result;
    }

    function _nibble(bytes1 c, string memory field) internal pure returns (uint8) {
        uint8 v = uint8(c);
        if (v >= 0x30 && v <= 0x39) return v - 0x30;
        if (v >= 0x61 && v <= 0x66) return v - 0x61 + 10;
        if (v >= 0x41 && v <= 0x46) return v - 0x41 + 10;
        revert MalformedHex(field);
    }
}
