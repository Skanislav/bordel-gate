mod merkle;

use std::ecdsa_secp256k1::verify_signature;
use keccak256::keccak256;
use crate::merkle::verify_inclusion;

global TREE_DEPTH: u32 = 16;
global PUBKEY_CONCAT_LEN: u32 = 64;

fn main(
    // private - wallet's secp256k1 key + signature over the challenge
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    signature: [u8; 64],
    // private - Merkle inclusion proof against the published root
    merkle_path: [[u8; 32]; 16],
    merkle_indices: [bool; 16],
    // public
    challenge: pub [u8; 32],
    root: pub [u8; 32],
    leaf: pub [u8; 32],
) {
    // 1. ECDSA verify
    let sig_ok = verify_signature(pub_key_x, pub_key_y, signature, challenge);
    assert(sig_ok, "bad signature");

    // 2. Leaf must equal keccak(pub_key_x || pub_key_y)
    let mut pubkey_concat: [u8; 64] = [0; 64];
    for j in 0..32 { pubkey_concat[j] = pub_key_x[j]; }
    for j in 0..32 { pubkey_concat[32 + j] = pub_key_y[j]; }
    let computed_leaf = keccak256(pubkey_concat, PUBKEY_CONCAT_LEN);
    assert(computed_leaf == leaf, "leaf mismatch");

    // 3. Merkle inclusion (asserts internally on failure)
    verify_inclusion(leaf, merkle_path, merkle_indices, root);
}

#[test]
fn test_main_compiles() {
    // Smoke test: ensure the module references resolve and constants exist.
    // Real correctness tests live in merkle.nr (depth-1 and depth-2 cases).
    let _ = TREE_DEPTH;
    let _ = PUBKEY_CONCAT_LEN;
}
