import {
  encodeAbiParameters,
  type Address,
  type Hex,
  type LocalAccount,
} from 'viem'

export interface Receipt {
  node: Hex
  value: Hex
  signedRoot: Hex
  blockNum: bigint
  blockHash: Hex
}

export const RECEIPT_ABI = [
  {
    type: 'tuple',
    components: [
      { name: 'node', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'signedRoot', type: 'bytes32' },
      { name: 'blockNum', type: 'uint64' },
      { name: 'blockHash', type: 'bytes32' },
    ],
  },
] as const

export const RECEIPT_TYPES = {
  Receipt: [
    { name: 'node', type: 'bytes32' },
    { name: 'value', type: 'bytes' },
    { name: 'signedRoot', type: 'bytes32' },
    { name: 'blockNum', type: 'uint64' },
    { name: 'blockHash', type: 'bytes32' },
  ],
} as const

export function buildDomain(chainId: number, verifyingContract: Address) {
  return {
    name: 'BordelGateway',
    version: '1',
    chainId,
    verifyingContract,
  } as const
}

export function encodeReceipt(r: Receipt): Hex {
  return encodeAbiParameters(RECEIPT_ABI, [r])
}

export interface SignContext {
  chainId: number
  verifyingContract: Address
}

export async function signReceipt(
  account: LocalAccount,
  r: Receipt,
  ctx: SignContext,
): Promise<Hex> {
  return account.signTypedData({
    domain: buildDomain(ctx.chainId, ctx.verifyingContract),
    types: RECEIPT_TYPES,
    primaryType: 'Receipt',
    message: r,
  })
}

const RESPONSE_ABI = [
  RECEIPT_ABI[0],
  { type: 'bytes' },
] as const

export function encodeResponse(receipt: Receipt, signature: Hex): Hex {
  return encodeAbiParameters(RESPONSE_ABI, [receipt, signature])
}
