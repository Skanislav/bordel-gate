mod merkle;

use std::ecdsa_secp256k1::verify_signature;
use poseidon::poseidon2::Poseidon2;

fn poseidon2_hash<let N: u32>(input: [Field; N], message_size: u32) -> Field {
    Poseidon2::hash(input, message_size)
}
use crate::merkle::verify_inclusion;

global TREE_DEPTH: u32 = 16;
global LEAF_INPUT_LEN: u32 = 4;

fn main(
    // private - wallet's secp256k1 key + signature over the challenge
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    signature: [u8; 64],
    // private - Merkle inclusion proof against the published root
    merkle_path: [Field; TREE_DEPTH],
    merkle_indices: [bool; TREE_DEPTH],
    // public
    challenge: pub [u8; 32],
    root: pub Field,
    leaf: pub Field,
) {
    // 1. ECDSA verify
    let sig_ok = verify_signature(pub_key_x, pub_key_y, signature, challenge);
    assert(sig_ok, "bad signature");

    // 2. leaf = poseidon2([x_high, x_low, y_high, y_low], 4) - split each 32-byte
    //    coord into a high-16 and low-16 chunk so each fits in BN254 Field.
    let x_high = bytes_to_field_high(pub_key_x);
    let x_low  = bytes_to_field_low(pub_key_x);
    let y_high = bytes_to_field_high(pub_key_y);
    let y_low  = bytes_to_field_low(pub_key_y);
    let computed_leaf = poseidon2_hash([x_high, x_low, y_high, y_low], LEAF_INPUT_LEN);
    assert(computed_leaf == leaf, "leaf mismatch");

    // 3. Merkle inclusion (asserts internally on failure)
    verify_inclusion(leaf, merkle_path, merkle_indices, root);
}

// Big-endian top 16 bytes of a 32-byte array as a Field.
fn bytes_to_field_high(bytes: [u8; 32]) -> Field {
    let mut acc: Field = 0;
    for i in 0..16 {
        acc = acc * 256 + bytes[i] as Field;
    }
    acc
}

// Big-endian bottom 16 bytes of a 32-byte array as a Field.
fn bytes_to_field_low(bytes: [u8; 32]) -> Field {
    let mut acc: Field = 0;
    for i in 16..32 {
        acc = acc * 256 + bytes[i] as Field;
    }
    acc
}

#[test]
fn test_main_compiles() {
    let _ = TREE_DEPTH;
    let _ = LEAF_INPUT_LEN;
}
