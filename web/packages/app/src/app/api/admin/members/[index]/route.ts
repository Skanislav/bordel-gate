import { NextResponse } from 'next/server'
import { removeMember, MembershipError } from '@/server/membership'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ index: string }> },
) {
  const { index: rawIndex } = await context.params
  const index = Number.parseInt(rawIndex, 10)
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: `invalid index "${rawIndex}"` }, { status: 400 })
  }
  try {
    const { db, removed } = await removeMember(index)
    return NextResponse.json({ removed, root: db.root, total: db.members.length })
  } catch (err) {
    if (err instanceof MembershipError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
