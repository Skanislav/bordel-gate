import {
  encodeAbiParameters,
  hashMessage,
  keccak256,
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

export function encodeReceipt(r: Receipt): Hex {
  return encodeAbiParameters(RECEIPT_ABI, [r])
}

export async function signReceipt(account: LocalAccount, r: Receipt): Promise<Hex> {
  const inner = keccak256(encodeReceipt(r))
  const digest = hashMessage({ raw: inner })
  return account.sign({ hash: digest })
}
