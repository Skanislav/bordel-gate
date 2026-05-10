import { NextResponse } from 'next/server'
import { cardForIndex, MembershipError } from '@/server/membership'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ index: string }> }) {
  const { index } = await ctx.params
  const n = Number.parseInt(index, 10)
  if (!Number.isInteger(n) || n < 0) {
    return NextResponse.json({ error: 'index must be a non-negative integer' }, { status: 400 })
  }
  try {
    const card = await cardForIndex(n)
    return NextResponse.json(card)
  } catch (err) {
    if (err instanceof MembershipError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
