// Browser-only membership store. Persists the member tree to localStorage so
// /commit can enroll/remove members entirely client-side — no API server.
// Schema is shared via CACHE_KEY so the /verify page reads the same key — no
// separate sync step.

import {
  getAddress,
  hashTypedData,
  hexToBytes,
  isAddress,
  isHex,
  recoverPublicKey,
  type Hex,
} from 'viem'
import { publicKeyToAddress } from 'viem/utils'
import {
  ENROLLMENT_PRIMARY_TYPE,
  enrollmentDomain,
  enrollmentTypes,
  type EnrollmentMessage,
} from './eip712'
import {
  computeRoot,
  leafFromPubkey,
  pathFor,
  rootOfEmptyTree,
  TREE_DEPTH,
} from './merkle'

export { TREE_DEPTH }
export const ENROLLMENT_TTL_SEC = 600
export const ENROLLMENT_FUTURE_SKEW_SEC = 60

export const STORAGE_KEY = 'bordel-membership-tree-v1'

export type Member = {
  name: string
  pubkey_x: Hex
  pubkey_y: Hex
  ether_address: Hex
  leaf: Hex
  leaf_index: number
  enrolled_at: string
  capabilities: string[]
  tier: string
}

export type MembersDb = {
  version: 1
  tree_depth: typeof TREE_DEPTH
  members: Member[]
  // Mirrored fields the gate page reads as `CachedTree`. Kept in lock-step with
  // members[] on every write so the prove flow can use the same key.
  root: Hex
  leaves: Hex[]
  members_count: number
  synced_at: number
}

export type MemberCard = {
  name: string
  pubkey_x: Hex
  pubkey_y: Hex
  ether_address: Hex
  leaf: Hex
  leaf_index: number
  root: Hex
  merkle_path: Hex[]
  merkle_indices: boolean[]
}

export class MembershipError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

const usedNonces = new Set<Hex>()

async function emptyDb(): Promise<MembersDb> {
  return {
    version: 1,
    tree_depth: TREE_DEPTH,
    members: [],
    root: await rootOfEmptyTree(),
    leaves: [],
    members_count: 0,
    synced_at: Date.now(),
  }
}

export async function loadDb(): Promise<MembersDb> {
  if (typeof window === 'undefined') return emptyDb()
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return emptyDb()
  let parsed: Partial<MembersDb>
  try {
    parsed = JSON.parse(raw) as Partial<MembersDb>
  } catch {
    return emptyDb()
  }
  if (parsed?.version !== 1 || !Array.isArray(parsed.members)) {
    return emptyDb()
  }
  // Re-derive every leaf from the pubkey so the persisted leaf is never trusted
  // (localStorage can be hand-edited).
  const members = parsed.members as Member[]
  for (const m of members) {
    m.leaf = await leafFromPubkey(m.pubkey_x, m.pubkey_y)
  }
  const leaves = members.map((m) => m.leaf)
  const root = await computeRoot(leaves)
  return {
    version: 1,
    tree_depth: TREE_DEPTH,
    members,
    root,
    leaves,
    members_count: members.length,
    synced_at: parsed.synced_at ?? Date.now(),
  }
}

function saveDb(db: MembersDb): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export type EnrollInput = {
  name: string
  pubkey_hex: string
  capabilities?: string[]
  tier?: string
}

export async function enrollMember(
  input: EnrollInput,
): Promise<{ db: MembersDb; member: Member }> {
  const name = input.name.trim().toLowerCase()
  if (!NAME_RE.test(name)) {
    throw new MembershipError(400, 'name must be lowercase alphanumeric+dash, 1-63 chars')
  }
  const { pkx, pky, addr } = parseUncompressedPubkey(input.pubkey_hex)

  const db = await loadDb()
  if (db.members.some((m) => m.name === name)) {
    throw new MembershipError(409, `member "${name}" already exists`)
  }
  if (db.members.some((m) => m.pubkey_x === pkx && m.pubkey_y === pky)) {
    throw new MembershipError(409, 'pubkey already enrolled under another name')
  }
  if (db.members.length >= 1 << TREE_DEPTH) {
    throw new MembershipError(409, `tree full (depth ${TREE_DEPTH})`)
  }

  const leaf = await leafFromPubkey(pkx, pky)
  const member: Member = {
    name,
    pubkey_x: pkx,
    pubkey_y: pky,
    ether_address: addr,
    leaf,
    leaf_index: db.members.length,
    enrolled_at: new Date().toISOString(),
    capabilities: normalizeCapabilities(input.capabilities),
    tier: (input.tier ?? 'member').trim().toLowerCase() || 'member',
  }
  db.members.push(member)
  db.leaves = db.members.map((m) => m.leaf)
  db.root = await computeRoot(db.leaves)
  db.members_count = db.members.length
  db.synced_at = Date.now()
  saveDb(db)
  return { db, member }
}

export async function removeMember(
  index: number,
): Promise<{ db: MembersDb; removed: Member }> {
  if (!Number.isInteger(index) || index < 0) {
    throw new MembershipError(400, `index must be a non-negative integer; got ${index}`)
  }
  const db = await loadDb()
  if (index >= db.members.length) {
    throw new MembershipError(404, `no member at index ${index}`)
  }
  const [removed] = db.members.splice(index, 1)
  for (let i = index; i < db.members.length; i++) {
    db.members[i].leaf_index = i
  }
  db.leaves = db.members.map((m) => m.leaf)
  db.root = await computeRoot(db.leaves)
  db.members_count = db.members.length
  db.synced_at = Date.now()
  saveDb(db)
  return { db, removed }
}

export type EnrollFromSignatureInput = {
  name: string
  address: Hex
  signature: Hex
  message: {
    name: string
    address: Hex
    nonce: Hex
    issuedAt: string | number | bigint
  }
  chainId: number
  capabilities?: string[]
  tier?: string
}

export async function enrollMemberFromSignature(
  input: EnrollFromSignatureInput,
): Promise<{ db: MembersDb; member: Member }> {
  if (!isAddress(input.address)) {
    throw new MembershipError(400, 'address is not a valid Ethereum address')
  }
  if (!isHex(input.signature, { strict: true }) || input.signature.length !== 132) {
    throw new MembershipError(400, 'signature must be 65 bytes (0x + 130 hex chars)')
  }
  if (!isAddress(input.message.address)) {
    throw new MembershipError(400, 'message.address is not a valid Ethereum address')
  }
  if (!isHexBytes32(input.message.nonce)) {
    throw new MembershipError(400, 'message.nonce must be 32 bytes (0x + 64 hex chars)')
  }
  if (input.name.trim().toLowerCase() !== input.message.name.trim().toLowerCase()) {
    throw new MembershipError(400, 'body.name does not match message.name')
  }
  if (getAddress(input.address) !== getAddress(input.message.address)) {
    throw new MembershipError(400, 'body.address does not match message.address')
  }

  let issuedAt: bigint
  try {
    issuedAt = BigInt(input.message.issuedAt)
  } catch {
    throw new MembershipError(400, 'message.issuedAt is not a valid integer')
  }
  const message: EnrollmentMessage = {
    name: input.message.name,
    address: getAddress(input.message.address),
    nonce: input.message.nonce,
    issuedAt,
  }
  const digest = hashTypedData({
    domain: enrollmentDomain(input.chainId),
    types: enrollmentTypes,
    primaryType: ENROLLMENT_PRIMARY_TYPE,
    message,
  })

  const recovered = await recoverPublicKey({ hash: digest, signature: input.signature })
  if (getAddress(publicKeyToAddress(recovered)) !== getAddress(input.address)) {
    throw new MembershipError(401, 'signature does not match claimed address')
  }

  const now = Math.floor(Date.now() / 1000)
  const issued = Number(issuedAt)
  if (now - issued > ENROLLMENT_TTL_SEC) {
    throw new MembershipError(
      401,
      `signature expired (issued ${now - issued}s ago, max ${ENROLLMENT_TTL_SEC}s)`,
    )
  }
  if (issued - now > ENROLLMENT_FUTURE_SKEW_SEC) {
    throw new MembershipError(401, 'signature issuedAt is in the future')
  }
  if (usedNonces.has(input.message.nonce)) {
    throw new MembershipError(409, 'nonce already used for a prior enrollment')
  }

  const result = await enrollMember({
    name: input.name,
    pubkey_hex: recovered,
    capabilities: input.capabilities,
    tier: input.tier,
  })
  usedNonces.add(input.message.nonce)
  return result
}

export async function cardForIndex(index: number): Promise<MemberCard> {
  const db = await loadDb()
  const member = db.members[index]
  if (!member) throw new MembershipError(404, `no member at index ${index}`)
  const { path, indices } = await pathFor(db.leaves, index)
  return {
    name: member.name,
    pubkey_x: member.pubkey_x,
    pubkey_y: member.pubkey_y,
    ether_address: member.ether_address,
    leaf: member.leaf,
    leaf_index: member.leaf_index,
    root: db.root,
    merkle_path: path,
    merkle_indices: indices,
  }
}

function parseUncompressedPubkey(input: string): { pkx: Hex; pky: Hex; addr: Hex } {
  const cleaned = input.trim().toLowerCase().replace(/^0x/, '')
  let body: string
  if (cleaned.length === 130 && cleaned.startsWith('04')) body = cleaned.slice(2)
  else if (cleaned.length === 128) body = cleaned
  else
    throw new MembershipError(
      400,
      `pubkey must be 130 hex chars (with 0x04) or 128 hex chars; got ${cleaned.length}`,
    )
  if (!/^[0-9a-f]+$/.test(body)) {
    throw new MembershipError(400, 'pubkey contains non-hex characters')
  }
  const pkx = ('0x' + body.slice(0, 64)) as Hex
  const pky = ('0x' + body.slice(64, 128)) as Hex
  const uncompressed = ('0x04' + body) as Hex
  // Touch hexToBytes so a malformed string surfaces here instead of in callers.
  hexToBytes(uncompressed)
  return { pkx, pky, addr: publicKeyToAddress(uncompressed) }
}

function normalizeCapabilities(input?: string[]): string[] {
  if (!input) return []
  const seen = new Set<string>()
  for (const c of input) {
    const v = c.trim().toLowerCase()
    if (v) seen.add(v)
  }
  return Array.from(seen).sort()
}

export function isHexBytes32(v: unknown): v is Hex {
  return typeof v === 'string' && isHex(v) && v.length === 66
}
