mod merkle;

use std::ecdsa_secp256k1::verify_signature;

fn main(
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
    signature: [u8; 64],
    hashed_message: pub [u8; 32],
) {
    let is_valid = verify_signature(pub_key_x, pub_key_y, signature, hashed_message);
    assert(is_valid, "Signature is valid");
}
