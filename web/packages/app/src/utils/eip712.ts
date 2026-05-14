// Shared EIP-712 typed-data shapes for the membership flows. Used by the
// /commit page so the enrollment digest is constructed consistently.
//
// Dependency budget: viem only. No node:* / no react. Safe in either runtime.

import { bytesToHex, type Hex } from 'viem'

export const EIP712_DOMAIN_NAME = 'BordelMembership'
export const EIP712_DOMAIN_VERSION = '1'

// Used so wallets render a domain that looks well-formed; we have no on-chain
// contract to bind to for enrollment.
export const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000'

export const enrollmentTypes = {
  MembershipEnrollment: [
    { name: 'name', type: 'string' },
    { name: 'address', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint256' },
  ],
} as const

export const ENROLLMENT_PRIMARY_TYPE = 'MembershipEnrollment' as const

export type EnrollmentMessage = {
  name: string
  address: Hex
  nonce: Hex
  issuedAt: bigint
}

export function enrollmentDomain(chainId: number) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: ZERO_ADDRESS,
  } as const
}

export function randomBytes32(): Hex {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return bytesToHex(buf)
}
