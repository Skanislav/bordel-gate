import { NextResponse } from 'next/server'
import { encodeAbiParameters, type Hex } from 'viem'
import { computeChallenge } from '../_lib/challenge'
import { encodeResponse, signReceipt, type Receipt } from '../_lib/receipt'
import { readRegistry } from '../_lib/registry'
import { getSignerAccount } from '../_lib/sign-config'
import {
  getReadClient,
  getResolverAddress,
  getBordelNode,
  getCurrentBlock,
} from '../_lib/chain-config'
import { lookupMember, capabilityOf } from '../_lib/db'
import { verifyProof } from '../_lib/verify'

interface LookupBody {
  name: string
  node: Hex
  selector: Hex
  selectorArgs: string[]
  nonce: Hex
  proof: Hex
  publicInputs: {
    challenge: Hex
    root: Hex
    leaf: Hex
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as LookupBody

  const registry = await readRegistry({
    client: getReadClient(),
    resolver: getResolverAddress(),
    bordelNode: getBordelNode(),
  })

  // 1. Challenge construction must match live config.
  const expected = computeChallenge({
    domain: registry.challengeDomain,
    nonce: body.nonce,
    node: body.node,
  })
  if (expected !== body.publicInputs.challenge) {
    return NextResponse.json({ error: 'challenge-mismatch' }, { status: 400 })
  }

  // 2. Root must match current chain root.
  if (body.publicInputs.root !== registry.memberRoot) {
    return NextResponse.json({ error: 'stale-root' }, { status: 403 })
  }

  // 3. Member must exist in DB and own the leaf.
  const member = lookupMember(body.name)
  if (!member) {
    return NextResponse.json({ error: 'unknown-member' }, { status: 404 })
  }
  if (member.leaf !== body.publicInputs.leaf) {
    return NextResponse.json({ error: 'leaf-mismatch' }, { status: 403 })
  }

  // 4. Capability check.
  const cap = capabilityOf(body.name)
  if (!member.capabilities.includes(cap)) {
    return NextResponse.json({ error: 'no-capability' }, { status: 403 })
  }

  // 5. Proof must verify (stub for v1).
  const ok = await verifyProof(body.proof, body.publicInputs)
  if (!ok) {
    return NextResponse.json({ error: 'bad-proof' }, { status: 400 })
  }

  // 6. Build and sign receipt.
  const block = await getCurrentBlock()
  const receipt: Receipt = {
    node: body.node,
    value: encodeAbiParameters([{ type: 'address' }], [member.address]),
    signedRoot: registry.memberRoot,
    blockNum: block.number,
    blockHash: block.hash,
  }
  const signer = getSignerAccount()
  const signature = await signReceipt(signer, receipt)

  const data = encodeResponse(receipt, signature)
  return NextResponse.json({ data })
}
