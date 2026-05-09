'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  useAccount,
  useReadContracts,
  useSendCalls,
  useCallsStatus,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { encodeFunctionData, type Hex } from 'viem'
import { BORDEL_RESOLVER_ABI } from '@/utils/bordel/resolver-abi'
import { ADMIN_FIXED_KEYS, readAdminEnv, type FixedKey } from '@/utils/bordel/admin-config'
import { Connect } from '@/components/Connect'
import { useNotifications } from '@/context/Notifications'

const MAX_GATEWAY_URLS = 8

function urlKey(i: number): string {
  return `bordel.gateway-url.${i}`
}

interface DirtyEntry {
  key: string
  value: string
}

export default function AdminPage() {
  const env = useMemo(() => {
    try {
      return readAdminEnv()
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [])

  if ('error' in env) {
    return (
      <div className='flex-column align-center p-8'>
        <h1 className='text-xl mb-4'>Bordel Admin</h1>
        <div className='alert alert-error'>{env.error}</div>
      </div>
    )
  }

  return <AdminInner resolver={env.resolver} bordelNode={env.bordelNode} />
}

function AdminInner({ resolver, bordelNode }: { resolver: `0x${string}`; bordelNode: Hex }) {
  const { address, isConnected } = useAccount()
  const { Add } = useNotifications()

  // Read all keys: fixed + indexed gateway-url.0..MAX-1
  const reads = useMemo(() => {
    const list: {
      address: `0x${string}`
      abi: typeof BORDEL_RESOLVER_ABI
      functionName: 'text'
      args: readonly [Hex, string]
    }[] = []
    for (const key of ADMIN_FIXED_KEYS) {
      list.push({ address: resolver, abi: BORDEL_RESOLVER_ABI, functionName: 'text', args: [bordelNode, key] as const })
    }
    for (let i = 0; i < MAX_GATEWAY_URLS; i++) {
      list.push({ address: resolver, abi: BORDEL_RESOLVER_ABI, functionName: 'text', args: [bordelNode, urlKey(i)] as const })
    }
    return list
  }, [resolver, bordelNode])

  const { data: readData, isLoading: readLoading, refetch } = useReadContracts({
    contracts: reads,
    query: { enabled: true },
  })

  // Map results back to per-key form state
  const [form, setForm] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!readData) return
    const next: Record<string, string> = {}
    ADMIN_FIXED_KEYS.forEach((k, i) => {
      const r = readData[i]
      next[k] = r.status === 'success' ? (r.result as string) : ''
    })
    for (let i = 0; i < MAX_GATEWAY_URLS; i++) {
      const r = readData[ADMIN_FIXED_KEYS.length + i]
      next[urlKey(i)] = r?.status === 'success' ? (r.result as string) : ''
    }
    setForm(next)
  }, [readData])

  const initialForm = useMemo(() => {
    if (!readData) return {} as Record<string, string>
    const next: Record<string, string> = {}
    ADMIN_FIXED_KEYS.forEach((k, i) => {
      const r = readData[i]
      next[k] = r.status === 'success' ? (r.result as string) : ''
    })
    for (let i = 0; i < MAX_GATEWAY_URLS; i++) {
      const r = readData[ADMIN_FIXED_KEYS.length + i]
      next[urlKey(i)] = r?.status === 'success' ? (r.result as string) : ''
    }
    return next
  }, [readData])

  const dirty: DirtyEntry[] = useMemo(() => {
    const out: DirtyEntry[] = []
    for (const k of Object.keys(form)) {
      if (form[k] !== initialForm[k]) out.push({ key: k, value: form[k] })
    }
    return out
  }, [form, initialForm])

  // Batched send via EIP-5792
  const { sendCalls, data: callsId, isPending: sendPending, error: sendError } = useSendCalls()
  const { data: callsStatus } = useCallsStatus({
    id: callsId?.id ?? ('0x' as `0x${string}`),
    query: { enabled: !!callsId },
  })

  // Per-call fallback when wallet doesn't support sendCalls
  const { writeContract, data: writeHash, isPending: writePending, error: writeError } = useWriteContract()
  const { isLoading: writeMining, isSuccess: writeSuccess } = useWaitForTransactionReceipt({ hash: writeHash })
  const [fallbackQueue, setFallbackQueue] = useState<DirtyEntry[]>([])

  const onSave = () => {
    if (dirty.length === 0) {
      Add('No changes to save', { type: 'info' })
      return
    }
    const calls = dirty.map((d) => ({
      to: resolver,
      data: encodeFunctionData({
        abi: BORDEL_RESOLVER_ABI,
        functionName: 'setText',
        args: [bordelNode, d.key, d.value],
      }) as Hex,
    }))
    sendCalls({ calls })
  }

  // If sendCalls fails as unsupported, fall back to sequential per-call writes
  useEffect(() => {
    if (!sendError) return
    const msg = sendError.message ?? ''
    const unsupported = /unsupported|not\s*supported|wallet_sendCalls/i.test(msg)
    if (unsupported) {
      Add('Wallet does not support batched calls; sending individually.', { type: 'info' })
      setFallbackQueue(dirty)
    } else {
      Add(`Send failed: ${msg}`, { type: 'error' })
    }
  }, [sendError])

  // Drain the fallback queue one tx at a time
  useEffect(() => {
    if (fallbackQueue.length === 0) return
    if (writePending || writeMining) return
    const [next, ...rest] = fallbackQueue
    writeContract({
      address: resolver,
      abi: BORDEL_RESOLVER_ABI,
      functionName: 'setText',
      args: [bordelNode, next.key, next.value],
    })
    setFallbackQueue(rest)
  }, [fallbackQueue, writePending, writeMining])

  useEffect(() => {
    if (writeSuccess) {
      Add('Parameter updated', { type: 'success' })
      refetch()
    }
  }, [writeSuccess])

  useEffect(() => {
    if (callsStatus?.status === 'success') {
      Add('Batch confirmed', { type: 'success' })
      refetch()
    }
  }, [callsStatus?.status])

  return (
    <div className='flex-column p-6 max-w-3xl mx-auto'>
      <div className='flex justify-between items-center mb-4'>
        <h1 className='text-2xl'>Bordel Admin</h1>
        <Connect />
      </div>

      <p className='text-sm opacity-70 mb-4'>
        Resolver: <code>{resolver}</code> · Node: <code>{bordelNode.slice(0, 10)}…</code>
      </p>

      {!isConnected && (
        <div className='alert alert-warning'>Connect your wallet (must be the bordel.eth owner) to edit parameters.</div>
      )}

      {readLoading && <div>Loading current values…</div>}

      {readData && (
        <div className='flex flex-col gap-3'>
          {ADMIN_FIXED_KEYS.map((k) => (
            <Field
              key={k}
              label={k}
              value={form[k] ?? ''}
              onChange={(v) => setForm((s) => ({ ...s, [k]: v }))}
              dirty={form[k] !== initialForm[k]}
            />
          ))}

          <div className='divider'>Gateway URLs (contiguous from .0)</div>

          {Array.from({ length: MAX_GATEWAY_URLS }).map((_, i) => {
            const k = urlKey(i)
            return (
              <Field
                key={k}
                label={k}
                value={form[k] ?? ''}
                onChange={(v) => setForm((s) => ({ ...s, [k]: v }))}
                dirty={form[k] !== initialForm[k]}
              />
            )
          })}
        </div>
      )}

      <div className='flex items-center gap-3 mt-6'>
        <button
          className='btn btn-primary'
          disabled={!isConnected || dirty.length === 0 || sendPending || writePending || writeMining}
          onClick={onSave}>
          {sendPending || writePending || writeMining
            ? 'Sending…'
            : `Save ${dirty.length} change${dirty.length === 1 ? '' : 's'}`}
        </button>
        {callsId && callsStatus?.status === 'pending' && <span className='loading loading-spinner' />}
      </div>

      {(sendError || writeError) && (
        <div className='alert alert-error mt-3'>{(sendError || writeError)?.message}</div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  dirty,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  dirty: boolean
}) {
  return (
    <label className='form-control w-full'>
      <div className='label'>
        <span className='label-text'>{label}</span>
        {dirty && <span className='label-text-alt text-warning'>edited</span>}
      </div>
      <input
        type='text'
        className={`input input-bordered w-full ${dirty ? 'input-warning' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='—'
      />
    </label>
  )
}
