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
}
