use poseidon::poseidon2::Poseidon2;

fn poseidon2_hash<let N: u32>(input: [Field; N], message_size: u32) -> Field {
    Poseidon2::hash(input, message_size)
}

global PAIR_LEN: u32 = 2;

// Verifies a Poseidon2-Merkle inclusion proof.
//
// path: sibling Field hashes for each level, from leaf level upward.
// indices: at each level, the position of the *current* node:
//   false (0) -> current is the LEFT child  (sibling concatenated on right)
//   true  (1) -> current is the RIGHT child (sibling concatenated on left)
pub fn verify_inclusion<let DEPTH: u32>(
    leaf: Field,
    path: [Field; DEPTH],
    indices: [bool; DEPTH],
    root: Field,
) {
    let mut current: Field = leaf;
    for i in 0..DEPTH {
        let sibling = path[i];
        let pair: [Field; 2] = if !indices[i] {
            // current on left, sibling on right
            [current, sibling]
        } else {
            // sibling on left, current on right
            [sibling, current]
        };
        current = poseidon2_hash(pair, PAIR_LEN);
    }
    assert(current == root, "merkle inclusion failed");
}

#[test]
fn test_two_leaf_tree_left() {
    // tree: root = poseidon2(leaf, sibling)
    let leaf: Field = 1;
    let sibling: Field = 2;
    let root = poseidon2_hash([leaf, sibling], PAIR_LEN);
    let path: [Field; 1] = [sibling];
    let indices: [bool; 1] = [false];
    verify_inclusion(leaf, path, indices, root);
}

#[test]
fn test_two_leaf_tree_right() {
    // tree: root = poseidon2(sibling, leaf)
    let leaf: Field = 3;
    let sibling: Field = 4;
    let root = poseidon2_hash([sibling, leaf], PAIR_LEN);
    let path: [Field; 1] = [sibling];
    let indices: [bool; 1] = [true];
    verify_inclusion(leaf, path, indices, root);
}

#[test(should_fail)]
fn test_wrong_path_fails() {
    let leaf: Field = 1;
    let bad_root: Field = 9;
    let path: [Field; 1] = [2];
    let indices: [bool; 1] = [false];
    verify_inclusion(leaf, path, indices, bad_root);
}

#[test]
fn test_depth_two_mixed_indices() {
    // 4-leaf tree at depth 2 with leaf L2 at index 2:
    //   layer 0 (leaves):  L0  L1  L2  L3
    //   layer 1 (parents): P0=poseidon2(L0,L1)  P1=poseidon2(L2,L3)
    //   root: R = poseidon2(P0, P1)
    //
    // L2 path: at level 0 L2 is LEFT child of P1 (sibling=L3, current on left -> indices[0]=false).
    // At level 1 P1 is RIGHT child of R (sibling=P0, current on right -> indices[1]=true).
    let l0: Field = 10;
    let l1: Field = 11;
    let l2: Field = 12;
    let l3: Field = 13;
    let p0 = poseidon2_hash([l0, l1], PAIR_LEN);
    let p1 = poseidon2_hash([l2, l3], PAIR_LEN);
    let root = poseidon2_hash([p0, p1], PAIR_LEN);
    let path: [Field; 2] = [l3, p0];
    let indices: [bool; 2] = [false, true];
    verify_inclusion(l2, path, indices, root);
}
