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
}
