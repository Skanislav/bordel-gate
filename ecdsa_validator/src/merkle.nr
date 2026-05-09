use keccak256::keccak256;

global INPUT_LEN: u32 = 64;

// Verifies a Merkle inclusion proof using keccak256 as the node hash.
// path: sibling hashes for each level, from leaf level upward.
// indices: at each level, the position of the *current* node:
//   false (0) -> current is the LEFT child  (sibling concatenated on right)
//   true  (1) -> current is the RIGHT child (sibling concatenated on left)
pub fn verify_inclusion<let DEPTH: u32>(
    leaf: [u8; 32],
    path: [[u8; 32]; DEPTH],
    indices: [bool; DEPTH],
    root: [u8; 32],
) {
    let mut current: [u8; 32] = leaf;
    for i in 0..DEPTH {
        let sibling = path[i];
        let mut concat: [u8; 64] = [0; 64];
        if !indices[i] {
            // current on left, sibling on right
            for j in 0..32 { concat[j] = current[j]; }
            for j in 0..32 { concat[32 + j] = sibling[j]; }
        } else {
            // sibling on left, current on right
            for j in 0..32 { concat[j] = sibling[j]; }
            for j in 0..32 { concat[32 + j] = current[j]; }
        }
        current = keccak256(concat, INPUT_LEN);
    }
    assert(current == root, "merkle inclusion failed");
}

#[test]
fn test_two_leaf_tree_left() {
    // tree: root = keccak(leaf || sibling)
    let leaf: [u8; 32] = [1; 32];
    let sibling: [u8; 32] = [2; 32];
    let mut concat: [u8; 64] = [0; 64];
    for j in 0..32 { concat[j] = leaf[j]; }
    for j in 0..32 { concat[32 + j] = sibling[j]; }
    let root = keccak256(concat, INPUT_LEN);
    let path: [[u8; 32]; 1] = [sibling];
    let indices: [bool; 1] = [false];
    verify_inclusion(leaf, path, indices, root);
}

#[test]
fn test_two_leaf_tree_right() {
    // tree: root = keccak(sibling || leaf)
    let leaf: [u8; 32] = [3; 32];
    let sibling: [u8; 32] = [4; 32];
    let mut concat: [u8; 64] = [0; 64];
    for j in 0..32 { concat[j] = sibling[j]; }
    for j in 0..32 { concat[32 + j] = leaf[j]; }
    let root = keccak256(concat, INPUT_LEN);
    let path: [[u8; 32]; 1] = [sibling];
    let indices: [bool; 1] = [true];
    verify_inclusion(leaf, path, indices, root);
}

#[test(should_fail)]
fn test_wrong_path_fails() {
    let leaf: [u8; 32] = [1; 32];
    let bad_root: [u8; 32] = [9; 32];
    let path: [[u8; 32]; 1] = [[2; 32]];
    let indices: [bool; 1] = [false];
    verify_inclusion(leaf, path, indices, bad_root);
}

#[test]
fn test_depth_two_mixed_indices() {
    // 4-leaf tree at depth 2:
    //   layer 0 (leaves):  L0  L1  L2  L3
    //   layer 1 (parents): P0=keccak(L0||L1)  P1=keccak(L2||L3)
    //   root: R = keccak(P0||P1)
    //
    // Prove inclusion of L2 (idx=2). At level 0 L2 is the LEFT child of P1
    // (sibling=L3, current on left -> indices[0]=false). At level 1 P1 is the
    // RIGHT child of R (sibling=P0, current on right -> indices[1]=true).

    let l0: [u8; 32] = [10; 32];
    let l1: [u8; 32] = [11; 32];
    let l2: [u8; 32] = [12; 32];
    let l3: [u8; 32] = [13; 32];

    let mut c01: [u8; 64] = [0; 64];
    for j in 0..32 { c01[j] = l0[j]; }
    for j in 0..32 { c01[32 + j] = l1[j]; }
    let p0 = keccak256(c01, INPUT_LEN);

    let mut c23: [u8; 64] = [0; 64];
    for j in 0..32 { c23[j] = l2[j]; }
    for j in 0..32 { c23[32 + j] = l3[j]; }
    let p1 = keccak256(c23, INPUT_LEN);

    let mut cR: [u8; 64] = [0; 64];
    for j in 0..32 { cR[j] = p0[j]; }
    for j in 0..32 { cR[32 + j] = p1[j]; }
    let root = keccak256(cR, INPUT_LEN);

    let path: [[u8; 32]; 2] = [l3, p0];
    let indices: [bool; 2] = [false, true];
    verify_inclusion(l2, path, indices, root);
}
