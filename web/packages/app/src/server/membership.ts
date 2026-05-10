// Server-only membership store. Backs the /api/admin/* routes and (later) the
// /api/gateway/* routes from the bordel-ens-gateway design. Source of truth is
// data/members.json relative to the app package; root + paths are recomputed
// from `members[]` on every read so the file can never drift.
//
// Do not import this module from a Client Component — it touches the
// filesystem and would crash the build. API route handlers only.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  getAddress,
  hashTypedData,
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
} from '@/utils/eip712'
import {
  computeRoot,
  leafFromPubkey,
  pathFor as merklePathFor,
  rootOfEmptyTree,
  TREE_DEPTH,
} from '@/utils/merkle'

export { TREE_DEPTH }
export const ENROLLMENT_TTL_SEC = 600
export const ENROLLMENT_FUTURE_SKEW_SEC = 60

// Chains the server will accept enrollment signatures from. The EIP-712 domain
// binds chainId, so a sig made on chain A cannot be replayed onto chain B
// unless both are allowlisted here. Override via env in deployment.
const ALLOWED_CHAIN_IDS: number[] = (() => {
  const raw = process.env.MEMBERSHIP_CHAIN_IDS
  if (!raw) return [11155111]
  return raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
})()

// One-shot signature enforcement, per-process. Per-restart loss is acceptable:
// the durable double-spend defence is `pubkey_x/y` uniqueness in members.json,
// which blocks re-enrolling the same address regardless of nonce reuse.
const usedNonces = new Set<Hex>()

// Where members.json lives. Defaults to <cwd>/data/members.json, which works
// for `yarn dev` (cwd = web/packages/app) and for the standalone runtime when
// no env var is set. On Railway, set MEMBERSHIP_DB_PATH=/data/members.json and
// mount a volume at /data so enrollments survive deploys.
const DB_PATH = process.env.MEMBERSHIP_DB_PATH
  ? resolve(process.env.MEMBERSHIP_DB_PATH)
  : resolve(process.cwd(), 'data', 'members.json')

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
  leaf_hash: 'poseidon2([x_high, x_low, y_high, y_low])'
  node_hash: 'poseidon2([left, right])'
  members: Member[]
  root: Hex
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

async function emptyDb(): Promise<MembersDb> {
  return {
    version: 1,
    tree_depth: TREE_DEPTH,
    leaf_hash: 'poseidon2([x_high, x_low, y_high, y_low])',
    node_hash: 'poseidon2([left, right])',
    members: [],
    root: await rootOfEmptyTree(),
  }
}

export async function loadDb(): Promise<MembersDb> {
  try {
    const raw = await readFile(DB_PATH, 'utf8')
    const parsed = JSON.parse(raw) as MembersDb
    // Re-derive every leaf from the pubkey so an older members.json (e.g.
    // from the keccak-leaf era) silently migrates on first read. The leaf is
    // a pure function of pubkey_x/y, so the persisted value is never trusted.
    for (const m of parsed.members) {
      m.leaf = await leafFromPubkey(m.pubkey_x, m.pubkey_y)
    }
    // Always recompute root + metadata from members so a hand-edited file
    // can't lie.
    parsed.leaf_hash = 'poseidon2([x_high, x_low, y_high, y_low])'
    parsed.node_hash = 'poseidon2([left, right])'
    parsed.root = await computeRoot(parsed.members.map((m) => m.leaf))
    return parsed
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDb()
    throw err
  }
}

async function saveDb(db: MembersDb): Promise<void> {
  await mkdir(dirname(DB_PATH), { recursive: true })
  await writeFile(DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8')
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

export type EnrollInput = {
  name: string
  pubkey_hex: string
  capabilities?: string[]
  tier?: string
}

export async function enrollMember(input: EnrollInput): Promise<{ db: MembersDb; member: Member }> {
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
  db.root = await computeRoot(db.members.map((m) => m.leaf))
  await saveDb(db)
  return { db, member }
}

// Removes the member at `index` and compacts the remaining members' leaf_index
// values so the tree stays gap-free (the prove-signature client expects
// consecutive indices to reconstruct the merkle path). This invalidates any
// previously-downloaded card for a member with index > `index`.
export async function removeMember(index: number): Promise<{ db: MembersDb; removed: Member }> {
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
  db.root = await computeRoot(db.members.map((m) => m.leaf))
  await saveDb(db)
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
  // 1. Shape validation.
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
  if (!ALLOWED_CHAIN_IDS.includes(input.chainId)) {
    throw new MembershipError(
      400,
      `chainId ${input.chainId} not in allowlist [${ALLOWED_CHAIN_IDS.join(', ')}]`,
    )
  }

  // 2. Cross-check that the body's name/address match what was actually signed.
  // Without this an attacker could capture a signature for "bob" and submit it
  // as an enrollment of "alice" — the digest wouldn't match either way, but
  // catching it here gives a clearer error.
  if (input.name.trim().toLowerCase() !== input.message.name.trim().toLowerCase()) {
    throw new MembershipError(400, 'body.name does not match message.name')
  }
  if (getAddress(input.address) !== getAddress(input.message.address)) {
    throw new MembershipError(400, 'body.address does not match message.address')
  }

  // 3. Reconstruct the digest the wallet should have signed.
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

  // 4. Recover pubkey, verify it derives to the claimed address. The recovered
  // pubkey is what we ultimately store as the member's identity, so the claim
  // is anchored to whoever actually controls the key.
  const recovered = await recoverPublicKey({ hash: digest, signature: input.signature })
  if (getAddress(publicKeyToAddress(recovered)) !== getAddress(input.address)) {
    throw new MembershipError(401, 'signature does not match claimed address')
  }

  // 5. TTL: bound the lifetime of a signature so a leaked one can't be reused
  // months later, and tolerate a small clock-skew.
  const now = Math.floor(Date.now() / 1000)
  const issued = Number(issuedAt)
  if (now - issued > ENROLLMENT_TTL_SEC) {
    throw new MembershipError(401, `signature expired (issued ${now - issued}s ago, max ${ENROLLMENT_TTL_SEC}s)`)
  }
  if (issued - now > ENROLLMENT_FUTURE_SKEW_SEC) {
    throw new MembershipError(401, 'signature issuedAt is in the future')
  }

  // 6. One-shot: each signature can only enroll once. The durable defence is
  // pubkey uniqueness in members.json (step 7), so this set surviving across
  // restarts isn't critical.
  if (usedNonces.has(input.message.nonce)) {
    throw new MembershipError(409, 'nonce already used for a prior enrollment')
  }

  // 7. Delegate to the existing enrollMember for name uniqueness, pubkey
  // uniqueness, tree-capacity, leaf computation, persistence, root recompute.
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
  let path: Hex[]
  let indices: boolean[]
  try {
    ;({ path, indices } = await merklePathFor(db.members.map((m) => m.leaf), index))
  } catch (err) {
    throw new MembershipError(400, err instanceof Error ? err.message : String(err))
  }
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

// --- pure helpers ---

function parseUncompressedPubkey(input: string): { pkx: Hex; pky: Hex; addr: Hex } {
  const cleaned = input.trim().toLowerCase().replace(/^0x/, '')
  // Accept both 04-prefixed (130 chars) and bare X||Y (128 chars).
  let body: string
  if (cleaned.length === 130 && cleaned.startsWith('04')) body = cleaned.slice(2)
  else if (cleaned.length === 128) body = cleaned
  else throw new MembershipError(400, `pubkey must be 130 hex chars (with 0x04) or 128 hex chars; got ${cleaned.length}`)
  if (!/^[0-9a-f]+$/.test(body)) throw new MembershipError(400, 'pubkey contains non-hex characters')
  const pkx = ('0x' + body.slice(0, 64)) as Hex
  const pky = ('0x' + body.slice(64, 128)) as Hex
  const uncompressed = ('0x04' + body) as Hex
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

// Re-export the merkle helpers so existing callers (loadDb, enrollMember) and
// downstream code don't need to know about utils/merkle directly.
export { computeRoot, merklePathFor as pathFor }

// Sanity check used by API input validation; not exported as a route helper to
// keep the surface small.
export function isHexBytes32(v: unknown): v is Hex {
  return typeof v === 'string' && isHex(v) && v.length === 66
}

export const __internals = { parseUncompressedPubkey }
