import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import {
  encodeAbiParameters,
  decodeAbiParameters as _decode,
  hashTypedData,
  recoverAddress,
  type Hex,
} from 'viem'
import {
  buildDomain,
  encodeReceipt,
  encodeResponse,
  signReceipt,
  RECEIPT_ABI,
  RECEIPT_TYPES,
  type Receipt,
} from '../receipt'

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')

const sample: Receipt = {
  node: '0xabababababababababababababababababababababababababababababababab',
  value: '0x000000000000000000000000beefbeefbeefbeefbeefbeefbeefbeefbeefbeef',
  signedRoot: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff',
  blockNum: 100n,
  blockHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
}

const ctx = {
  chainId: 11155111,
  verifyingContract: '0x000000000000000000000000000000000000b0de' as const,
}

describe('receipt encoding', () => {
  it('encodeReceipt is reversible', () => {
    const encoded = encodeReceipt(sample)
    const decoded = encodeAbiParameters(RECEIPT_ABI, [sample])
    expect(encoded).toBe(decoded)
  })
})

describe('signReceipt (EIP-712)', () => {
  it('signature recovers to the signing account', async () => {
    const sig = await signReceipt(account, sample, ctx)
    const digest = hashTypedData({
      domain: buildDomain(ctx.chainId, ctx.verifyingContract),
      types: RECEIPT_TYPES,
      primaryType: 'Receipt',
      message: sample,
    })
    const recovered = await recoverAddress({ hash: digest, signature: sig })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })

  it('different verifyingContract yields different signature', async () => {
    const a = await signReceipt(account, sample, ctx)
    const b = await signReceipt(account, sample, {
      chainId: ctx.chainId,
      verifyingContract: '0x000000000000000000000000000000000000dead',
    })
    expect(a).not.toBe(b)
  })
})

describe('encodeResponse', () => {
  it('round-trips through abi.decode((Receipt, bytes))', async () => {
    const sig = await signReceipt(account, sample, ctx)
    const data = encodeResponse(sample, sig)
    const [decodedReceipt, decodedSig] = _decode(
      [RECEIPT_ABI[0], { type: 'bytes' }],
      data,
    ) as [typeof sample, Hex]
    expect(decodedReceipt.node).toBe(sample.node)
    expect(decodedReceipt.signedRoot).toBe(sample.signedRoot)
    expect(decodedReceipt.blockNum).toBe(sample.blockNum)
    expect(decodedSig).toBe(sig)
  })
})
