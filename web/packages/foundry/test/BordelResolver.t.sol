// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BordelResolver.sol";

contract BordelResolverTest is Test {
    BordelResolver resolver;
    bytes32 constant BORDEL_NODE = keccak256(abi.encodePacked(bytes32(0), keccak256("bordel-test")));
    address admin = address(0xA11CE);

    function setUp() public {
        vm.prank(admin);
        resolver = new BordelResolver(BORDEL_NODE);
    }

    function test_setText_admin_only() public {
        vm.prank(admin);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0x01");
        assertEq(resolver.text(BORDEL_NODE, "bordel.member-root"), "0x01");
    }

    function test_setText_non_admin_reverts() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(BordelResolver.NotAdmin.selector);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0x01");
    }

    function test_root_helper_reads_text_record() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "bordel.member-root", "0x1234567890123456789012345678901234567890123456789012345678901234");
        vm.stopPrank();
        assertEq(resolver.exposedRoot(), bytes32(0x1234567890123456789012345678901234567890123456789012345678901234));
    }

    function test_signer_helper() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "bordel.gateway-signer", "0x000000000000000000000000000000000000abcd");
        vm.stopPrank();
        assertEq(resolver.exposedSigner(), address(0xABCD));
    }

    function test_freshness_helper() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "bordel.freshness-window", "30");
        vm.stopPrank();
        assertEq(resolver.exposedFreshness(), 30);
    }

    function test_missing_param_reverts() public {
        vm.expectRevert(BordelResolver.MissingParameter.selector);
        resolver.exposedRoot();
    }

    function test_addr_for_parent_reads_text_record() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "addr", "0x000000000000000000000000000000000000beef");
        vm.stopPrank();
        assertEq(resolver.addr(BORDEL_NODE), address(0xBEEF));
    }

    function test_resolve_parent_addr_returns_text() public {
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "addr", "0x000000000000000000000000000000000000beef");
        vm.stopPrank();
        bytes memory data = abi.encodeWithSelector(0x3b3b57de, BORDEL_NODE);
        bytes memory dnsName = _dnsEncode("bordel-test");
        bytes memory result = resolver.resolve(dnsName, data);
        assertEq(abi.decode(result, (address)), address(0xBEEF));
    }

    function test_resolve_subname_reverts_with_offchain_lookup() public {
        vm.prank(admin);
        resolver.setText(BORDEL_NODE, "bordel.gateway-url", "https://example/api");
        bytes32 subnode = keccak256(abi.encodePacked(BORDEL_NODE, keccak256("skas")));
        bytes memory data = abi.encodeWithSelector(0x3b3b57de, subnode);
        bytes memory dnsName = _dnsEncodeMulti("skas", "bordel-test");

        // OffchainLookup error data is complex (ABI-encoded); just assert it reverts.
        vm.expectRevert();
        resolver.resolve(dnsName, data);
    }

    function test_resolve_subname_without_gateway_url_reverts_missing_param() public {
        bytes32 subnode = keccak256(abi.encodePacked(BORDEL_NODE, keccak256("skas")));
        bytes memory data = abi.encodeWithSelector(0x3b3b57de, subnode);
        bytes memory dnsName = _dnsEncodeMulti("skas", "bordel-test");
        vm.expectRevert(BordelResolver.MissingParameter.selector);
        resolver.resolve(dnsName, data);
    }

    function test_setText_gateway_url_persists() public {
        vm.prank(admin);
        resolver.setText(BORDEL_NODE, "bordel.gateway-url", "https://gateway.example/api/gateway/lookup");
        assertEq(resolver.text(BORDEL_NODE, "bordel.gateway-url"), "https://gateway.example/api/gateway/lookup");
    }

    // --- resolveWithProof tests ---

    uint256 constant SIGNER_PK = 0xA11CE000000000000000000000000000000000000000000000000000000000A1;
    address signerAddr;

    function _setupGatewayParams(bytes32 root) internal {
        signerAddr = vm.addr(SIGNER_PK);
        vm.startPrank(admin);
        resolver.setText(BORDEL_NODE, "bordel.member-root", _bytes32ToHexString(root));
        resolver.setText(BORDEL_NODE, "bordel.gateway-signer", _addrToHexString(signerAddr));
        resolver.setText(BORDEL_NODE, "bordel.freshness-window", "30");
        resolver.setText(BORDEL_NODE, "bordel.gateway-url", "https://example/api");
        vm.stopPrank();
    }

    function _digest(
        address vc, bytes32 node, bytes memory value, bytes32 signedRoot, uint64 blockNum, bytes32 bh
    ) internal view returns (bytes32) {
        bytes32 ds = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("BordelGateway"),
            keccak256("1"),
            block.chainid,
            vc
        ));
        bytes32 sh = keccak256(abi.encode(
            keccak256("Receipt(bytes32 node,bytes value,bytes32 signedRoot,uint64 blockNum,bytes32 blockHash)"),
            node, keccak256(value), signedRoot, blockNum, bh
        ));
        return keccak256(abi.encodePacked("\x19\x01", ds, sh));
    }

    function _signReceipt(
        bytes32 node, bytes memory value, bytes32 signedRoot, uint64 blockNum, bytes32 bh
    ) internal view returns (bytes memory) {
        bytes32 d = _digest(address(resolver), node, value, signedRoot, blockNum, bh);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, d);
        return abi.encodePacked(r, s, v);
    }

    function _buildResponse(
        bytes32 node, bytes memory value, bytes32 signedRoot, uint64 blockNum, bytes32 bh
    ) internal view returns (bytes memory) {
        bytes memory sig = _signReceipt(node, value, signedRoot, blockNum, bh);
        bytes memory receipt = abi.encode(node, value, signedRoot, blockNum, bh);
        return abi.encode(receipt, sig);
    }

    function test_resolveWithProof_happy_path() public {
        vm.roll(1000);
        bytes32 root = bytes32(uint256(0x1007));
        _setupGatewayParams(root);
        bytes32 node = keccak256("door.skas");
        bytes memory value = abi.encode(address(0xCAFE));
        uint64 blockNum = uint64(block.number - 1);
        bytes32 bh = blockhash(blockNum);

        bytes memory response = _buildResponse(node, value, root, blockNum, bh);
        bytes memory result = resolver.resolveWithProof(response, abi.encode(node, ""));
        assertEq(abi.decode(result, (address)), address(0xCAFE));
    }

    function test_resolveWithProof_stale_root_reverts() public {
        vm.roll(1000);
        bytes32 root = bytes32(uint256(0x2007));
        _setupGatewayParams(root);
        bytes32 node = keccak256("door.skas");
        bytes memory value = abi.encode(address(0xCAFE));
        uint64 blockNum = uint64(block.number - 1);
        bytes32 bh = blockhash(blockNum);
        bytes32 OLD_ROOT = bytes32(uint256(0xDEAD7007));

        bytes memory response = _buildResponse(node, value, OLD_ROOT, blockNum, bh);
        vm.expectRevert(BordelResolver.StaleRoot.selector);
        resolver.resolveWithProof(response, abi.encode(node, ""));
    }

    function test_resolveWithProof_stale_block_reverts() public {
        vm.roll(1000);
        bytes32 root = bytes32(uint256(0x3007));
        _setupGatewayParams(root);
        bytes32 node = keccak256("door.skas");
        bytes memory value = abi.encode(address(0xCAFE));
        uint64 oldBlock = 100;  // 900 blocks old, well beyond 30-block window
        bytes32 bh = blockhash(oldBlock);

        bytes memory response = _buildResponse(node, value, root, oldBlock, bh);
        vm.expectRevert(BordelResolver.StaleBlock.selector);
        resolver.resolveWithProof(response, abi.encode(node, ""));
    }

    function test_resolveWithProof_wrong_signer_reverts() public {
        vm.roll(1000);
        bytes32 root = bytes32(uint256(0x4007));
        _setupGatewayParams(root);
        bytes32 node = keccak256("door.skas");
        bytes memory value = abi.encode(address(0xCAFE));
        uint64 blockNum = uint64(block.number - 1);
        bytes32 bh = blockhash(blockNum);

        bytes32 d = _digest(address(resolver), node, value, root, blockNum, bh);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, d);
        bytes memory sig = abi.encodePacked(r, s, v);
        bytes memory receipt = abi.encode(node, value, root, blockNum, bh);
        bytes memory response = abi.encode(receipt, sig);

        vm.expectRevert(BordelResolver.InvalidSignature.selector);
        resolver.resolveWithProof(response, abi.encode(node, ""));
    }

    function test_resolveWithProof_node_mismatch_reverts() public {
        vm.roll(1000);
        bytes32 root = bytes32(uint256(0x5007));
        _setupGatewayParams(root);
        bytes32 node = keccak256("door.skas");
        bytes32 otherNode = keccak256("gym.skas");
        bytes memory value = abi.encode(address(0xCAFE));
        uint64 blockNum = uint64(block.number - 1);
        bytes32 bh = blockhash(blockNum);

        bytes memory response = _buildResponse(node, value, root, blockNum, bh);
        vm.expectRevert(BordelResolver.NodeMismatch.selector);
        resolver.resolveWithProof(response, abi.encode(otherNode, ""));
    }

    function test_resolveWithProof_blockhash_mismatch_reverts() public {
        vm.roll(1000);
        bytes32 root = bytes32(uint256(0x6007));
        _setupGatewayParams(root);
        bytes32 node = keccak256("door.skas");
        bytes memory value = abi.encode(address(0xCAFE));
        uint64 blockNum = uint64(block.number - 1);
        bytes32 wrongBh = bytes32(uint256(0xDEADBEEF));

        bytes memory response = _buildResponse(node, value, root, blockNum, wrongBh);
        vm.expectRevert(BordelResolver.BlockHashMismatch.selector);
        resolver.resolveWithProof(response, abi.encode(node, ""));
    }

    // --- helpers for hex conversion ---

    function _bytes32ToHexString(bytes32 b) internal pure returns (string memory) {
        bytes memory out = new bytes(66);
        out[0] = "0"; out[1] = "x";
        for (uint i = 0; i < 32; i++) {
            uint8 hi = uint8(b[i]) >> 4;
            uint8 lo = uint8(b[i]) & 0xf;
            out[2 + i*2]     = hi < 10 ? bytes1(uint8(0x30) + hi) : bytes1(uint8(0x61) + hi - 10);
            out[2 + i*2 + 1] = lo < 10 ? bytes1(uint8(0x30) + lo) : bytes1(uint8(0x61) + lo - 10);
        }
        return string(out);
    }

    function _addrToHexString(address a) internal pure returns (string memory) {
        return _bytes32ToHexString(bytes32(uint256(uint160(a))));
    }

    // --- DNS encoding helpers used by the resolve tests ---

    function _dnsEncode(string memory label) internal pure returns (bytes memory) {
        bytes memory l = bytes(label);
        bytes memory out = new bytes(1 + l.length + 1);
        out[0] = bytes1(uint8(l.length));
        for (uint256 i = 0; i < l.length; i++) out[1 + i] = l[i];
        out[out.length - 1] = 0x00;
        return out;
    }

    function _dnsEncodeMulti(string memory sub, string memory parent) internal pure returns (bytes memory) {
        bytes memory s = bytes(sub);
        bytes memory p = bytes(parent);
        bytes memory out = new bytes(1 + s.length + 1 + p.length + 1);
        uint256 o = 0;
        out[o++] = bytes1(uint8(s.length));
        for (uint256 i = 0; i < s.length; i++) out[o++] = s[i];
        out[o++] = bytes1(uint8(p.length));
        for (uint256 i = 0; i < p.length; i++) out[o++] = p[i];
        out[o] = 0x00;
        return out;
    }
}
