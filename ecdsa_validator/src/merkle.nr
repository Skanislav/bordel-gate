use keccak256::keccak256;

// Verifies a Merkle inclusion proof using keccak256 as the node hash.
// path: sibling hashes from leaf to root
// indices: bit per level, false = sibling on right, true = sibling on left
pub fn verify_inclusion<let DEPTH: u32>(
    leaf: [u8; 32],
    path: [[u8; 32]; DEPTH],
    indices: [bool; DEPTH],
    root: [u8; 32],
) -> bool {
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
        current = keccak256(concat, 64);
    }
    current == root
}

#[test]
fn test_two_leaf_tree_left() {
    // tree: root = keccak(leaf || sibling)
    let leaf: [u8; 32] = [1; 32];
    let sibling: [u8; 32] = [2; 32];
    let mut concat: [u8; 64] = [0; 64];
    for j in 0..32 { concat[j] = leaf[j]; }
    for j in 0..32 { concat[32 + j] = sibling[j]; }
    let root = keccak256(concat, 64);
    let path: [[u8; 32]; 1] = [sibling];
    let indices: [bool; 1] = [false];
    assert(verify_inclusion(leaf, path, indices, root));
}

#[test]
fn test_two_leaf_tree_right() {
    let leaf: [u8; 32] = [3; 32];
    let sibling: [u8; 32] = [4; 32];
    let mut concat: [u8; 64] = [0; 64];
    for j in 0..32 { concat[j] = sibling[j]; }
    for j in 0..32 { concat[32 + j] = leaf[j]; }
    let root = keccak256(concat, 64);
    let path: [[u8; 32]; 1] = [sibling];
    let indices: [bool; 1] = [true];
    assert(verify_inclusion(leaf, path, indices, root));
}

#[test(should_fail)]
fn test_wrong_path_fails() {
    let leaf: [u8; 32] = [1; 32];
    let bad_root: [u8; 32] = [9; 32];
    let path: [[u8; 32]; 1] = [[2; 32]];
    let indices: [bool; 1] = [false];
    assert(verify_inclusion(leaf, path, indices, bad_root));
}
