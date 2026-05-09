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
