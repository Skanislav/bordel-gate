import { NextResponse } from 'next/server'
import {
  enrollMember,
  enrollMemberFromSignature,
  loadDb,
  MembershipError,
  type EnrollFromSignatureInput,
  type EnrollInput,
} from '@/server/membership'

export const dynamic = 'force-dynamic'

type PubkeyBody = { kind?: 'pubkey' } & Partial<EnrollInput>
type SignatureBody = { kind: 'signature' } & Partial<EnrollFromSignatureInput>
type Body = PubkeyBody | SignatureBody

export async function GET() {
  const db = await loadDb()
  return NextResponse.json(db)
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  try {
    if (body.kind === 'signature') {
      if (
        typeof body.name !== 'string' ||
        typeof body.address !== 'string' ||
        typeof body.signature !== 'string' ||
        typeof body.chainId !== 'number' ||
        typeof body.message !== 'object' ||
        body.message === null
      ) {
        return NextResponse.json(
          { error: 'name, address, signature, message, chainId required for kind=signature' },
          { status: 400 },
        )
      }
      const { db, member } = await enrollMemberFromSignature({
        name: body.name,
        address: body.address,
        signature: body.signature,
        message: body.message as EnrollFromSignatureInput['message'],
        chainId: body.chainId,
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : undefined,
        tier: typeof body.tier === 'string' ? body.tier : undefined,
      })
      return NextResponse.json({ member, root: db.root, total: db.members.length }, { status: 201 })
    }

    // Default / explicit kind=pubkey
    if (typeof body.name !== 'string' || typeof body.pubkey_hex !== 'string') {
      return NextResponse.json({ error: 'name and pubkey_hex are required' }, { status: 400 })
    }
    const { db, member } = await enrollMember({
      name: body.name,
      pubkey_hex: body.pubkey_hex,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : undefined,
      tier: typeof body.tier === 'string' ? body.tier : undefined,
    })
    return NextResponse.json({ member, root: db.root, total: db.members.length }, { status: 201 })
  } catch (err) {
    if (err instanceof MembershipError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
