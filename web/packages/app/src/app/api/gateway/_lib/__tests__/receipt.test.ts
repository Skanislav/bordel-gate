import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { encodeAbiParameters, hashMessage, keccak256, recoverAddress } from 'viem'
import { encodeReceipt, signReceipt, RECEIPT_ABI, type Receipt } from '../receipt'

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')

const sample: Receipt = {
  node: '0xabababababababababababababababababababababababababababababababab',
  value: '0x000000000000000000000000beefbeefbeefbeefbeefbeefbeefbeefbeefbeef',
  signedRoot: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff',
  blockNum: 100n,
  blockHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
}

describe('receipt encoding', () => {
  it('encodeReceipt is reversible', () => {
    const encoded = encodeReceipt(sample)
    const decoded = encodeAbiParameters(RECEIPT_ABI, [sample])
    expect(encoded).toBe(decoded)
  })
})

describe('signReceipt', () => {
  it('signature recovers to the signing account (EIP-191)', async () => {
    const sig = await signReceipt(account, sample)
    const recovered = await recoverAddress({
      hash: hashMessage({ raw: keccak256(encodeReceipt(sample)) }),
      signature: sig,
    })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })
})
