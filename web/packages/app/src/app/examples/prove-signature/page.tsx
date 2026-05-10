'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAccount, useChainId, useConnect, useSignTypedData } from 'wagmi'
import {
  bytesToHex,
  hashTypedData,
  hexToBytes,
  recoverPublicKey,
  type Hex,
} from 'viem'
import { useNotifications } from '@/context/Notifications'
import { generateProof, verifyProof, type ProofResult } from '@/utils/noir'
import type { EcdsaValidatorInput } from '@/utils/circuits/ecdsa_validator'
import { computeRoot, leafFromPubkeyBytes, pathFor } from '@/utils/merkle'

// libhalo bundles ethers + elliptic + pbkdf2 + qrcode + jose. ~hundreds of kB.
// Static import would parse all of that on every page open even when the user
// never picks the HaLo signer. We lazy-load it on first HaLo click instead.
type ExecHaloCmdWeb = typeof import('@arx-research/libhalo/api/web').execHaloCmdWeb
let haloCmdPromise: Promise<ExecHaloCmdWeb> | null = null
async function loadHaloCmd(): Promise<ExecHaloCmdWeb> {
  if (!haloCmdPromise) {
    haloCmdPromise = import('@arx-research/libhalo/api/web').then((m) => m.execHaloCmdWeb)
  }
  return haloCmdPromise
}

type Status = 'idle' | 'signing' | 'proving' | 'verifying' | 'done' | 'error'
type Method = 'eoa' | 'halo'

type CachedTree = {
  version: 1
  root: Hex
  leaves: Hex[]
  members_count: number
  synced_at: number
}

const HALO_KEY_SLOT = 1
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const ZERO_BYTES32 = ('0x' + '00'.repeat(32)) as Hex
const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141')
const SECP256K1_HALF_N = SECP256K1_N / BigInt(2)
const BYTE_MASK = BigInt(0xff)
const CACHE_KEY = 'bordel-membership-tree-v1'

const truncate = (hex: string, head = 10, tail = 8) =>
  hex.length <= head + tail + 3 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`

const eip712Types = {
  AccessRequest: [
    { name: 'gate', type: 'address' },
    { name: 'challenge', type: 'bytes32' },
    { name: 'policyHash', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint256' },
  ],
} as const

function randomBytes32(): Hex {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return bytesToHex(buf)
}

function normalizeLowS(rs: Uint8Array): Uint8Array {
  let s = BigInt(0)
  for (let i = 0; i < 32; i++) s = (s << BigInt(8)) | BigInt(rs[32 + i])
  if (s <= SECP256K1_HALF_N) return rs
  s = SECP256K1_N - s
  const out = new Uint8Array(64)
  out.set(rs.subarray(0, 32), 0)
  for (let i = 31; i >= 0; i--) {
    out[32 + i] = Number(s & BYTE_MASK)
    s >>= BigInt(8)
  }
  return out
}

function loadCache(): CachedTree | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedTree
    if (parsed?.version !== 1 || !Array.isArray(parsed.leaves)) return null
    return parsed
  } catch {
    return null
  }
}

function saveCache(c: CachedTree) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    // ignore quota
  }
}

function fmtTime(ms: number | null): string {
  if (!ms) return '--:--:--'
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// -----------------------------------------------------------------------------

export default function GatePage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { signTypedDataAsync } = useSignTypedData()
  const { connectAsync, connectors } = useConnect()
  const { Add } = useNotifications()

  const [gate, setGate] = useState<Hex>(ZERO_ADDRESS)
  const [policyHash, setPolicyHash] = useState<Hex>(ZERO_BYTES32)
  const [status, setStatus] = useState<Status>('idle')
  const [activeMethod, setActiveMethod] = useState<Method | null>(null)
  const [proof, setProof] = useState<ProofResult | null>(null)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [lastDigest, setLastDigest] = useState<Hex | null>(null)
  const [lastLeaf, setLastLeaf] = useState<Hex | null>(null)
  const [cache, setCache] = useState<CachedTree | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const busy = status === 'signing' || status === 'proving' || status === 'verifying'

  const domain = useMemo(
    () => ({
      name: 'ZKAccess',
      version: '1',
      chainId,
      verifyingContract: ZERO_ADDRESS,
    }),
    [chainId],
  )

  const syncMembers = useCallback(
    async (opts: { silent?: boolean; timeoutMs?: number } = {}): Promise<CachedTree | null> => {
      setSyncing(true)
      const ctrl = new AbortController()
      const timeoutMs = opts.timeoutMs ?? (opts.silent ? 5000 : 15000)
      const timeoutId = window.setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetch('/api/admin/members', { cache: 'no-store', signal: ctrl.signal })
        if (!res.ok) throw new Error(`GET /api/admin/members ${res.status}`)
        const db = (await res.json()) as { root: Hex; members: { leaf: Hex; leaf_index: number }[] }
        const ordered = [...db.members].sort((a, b) => a.leaf_index - b.leaf_index)
        for (let i = 0; i < ordered.length; i++) {
          if (ordered[i].leaf_index !== i) {
            throw new Error(`leaf_index gap at ${i} (got ${ordered[i].leaf_index}); cannot reconstruct path`)
          }
        }
        const leaves = ordered.map((m) => m.leaf)
        const localRoot = computeRoot(leaves)
        if (localRoot !== db.root) {
          throw new Error(`local root != server root`)
        }
        const fresh: CachedTree = {
          version: 1,
          root: db.root,
          leaves,
          members_count: leaves.length,
          synced_at: Date.now(),
        }
        saveCache(fresh)
        setCache(fresh)
        if (!opts.silent) {
          Add(`synced ${fresh.members_count} member${fresh.members_count === 1 ? '' : 's'}`, {
            type: 'success',
          })
        }
        return fresh
      } catch (err) {
        const aborted = (err as { name?: string })?.name === 'AbortError'
        const msg = aborted ? `timed out after ${timeoutMs}ms` : err instanceof Error ? err.message : String(err)
        if (!opts.silent) Add(`sync failed: ${msg}`, { type: 'error' })
        return null
      } finally {
        window.clearTimeout(timeoutId)
        setSyncing(false)
      }
    },
    [Add],
  )

  useEffect(() => {
    const cached = loadCache()
    if (cached) setCache(cached)
    void syncMembers({ silent: true })
  }, [syncMembers])

  const ensureWalletConnected = async () => {
    if (isConnected) return
    const inj = connectors.find((c) => c.id === 'injected') ?? connectors[0]
    if (!inj) throw new Error('no injected wallet detected — install MetaMask / Rabby / Frame')
    await connectAsync({ connector: inj })
  }

  const runProof = async (method: Method) => {
    setProof(null)
    setVerified(null)
    setErrorMsg(null)
    if (!cache) {
      Add('no member tree cached — wait for sync or click [sync]', { type: 'error' })
      return
    }
    if (cache.members_count === 0) {
      Add('no members enrolled — visit /admin', { type: 'error' })
      return
    }
    setActiveMethod(method)
    try {
      if (method === 'eoa') {
        await ensureWalletConnected()
      }
      setStatus('signing')

      const accessRequest = {
        gate,
        challenge: randomBytes32(),
        policyHash,
        issuedAt: BigInt(Math.floor(Date.now() / 1000)),
      } as const

      // Hash with viem so HaLo gets a flat 32-byte digest; libhalo's typedData mode froze on macOS.
      const digest = hashTypedData({
        domain,
        types: eip712Types,
        primaryType: 'AccessRequest',
        message: accessRequest,
      })
      setLastDigest(digest)

      const signatureHex = await (method === 'eoa'
        ? signTypedDataAsync({
            domain,
            types: eip712Types,
            primaryType: 'AccessRequest',
            message: accessRequest,
          })
        : signWithHalo(digest))

      const sigBytes = hexToBytes(signatureHex)
      if (sigBytes.length !== 65) throw new Error(`unexpected signature length: ${sigBytes.length}`)

      const pubKeyHex = await recoverPublicKey({ hash: digest, signature: signatureHex })
      const pubKeyBytes = hexToBytes(pubKeyHex)
      if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
        throw new Error('recovered pubkey is not in uncompressed form')
      }
      const pkx = pubKeyBytes.slice(1, 33)
      const pky = pubKeyBytes.slice(33, 65)

      const leafHex = leafFromPubkeyBytes(pkx, pky)
      setLastLeaf(leafHex)

      const leafIndex = cache.leaves.indexOf(leafHex)
      if (leafIndex < 0) {
        throw new Error(
          `not enrolled (leaf ${truncate(leafHex)} not in ${cache.members_count}-member tree). enroll at /admin and re-sync.`,
        )
      }
      const { path, indices } = pathFor(cache.leaves, leafIndex)
      const root = cache.root
      const rs = normalizeLowS(sigBytes.subarray(0, 64))

      const input: EcdsaValidatorInput = {
        pub_key_x: Array.from(pkx),
        pub_key_y: Array.from(pky),
        signature: Array.from(rs),
        merkle_path: path.map((p) => Array.from(hexToBytes(p))),
        merkle_indices: indices,
        challenge: Array.from(hexToBytes(digest)),
        root: Array.from(hexToBytes(root)),
        leaf: Array.from(hexToBytes(leafHex)),
      }

      setStatus('proving')
      const generated = await generateProof(input)
      setProof(generated)

      setStatus('verifying')
      const ok = await verifyProof(generated)
      setVerified(ok)
      setStatus('done')

      Add(ok ? `verified — member at leaf ${leafIndex}` : 'proof verification failed', {
        type: ok ? 'success' : 'error',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/user rejected|rejected the request|denied|4001/i.test(msg)) {
        Add('signature cancelled', { type: 'info' })
        setStatus('idle')
      } else {
        setErrorMsg(msg)
        setStatus('error')
        Add(`failed: ${msg}`, { type: 'error' })
      }
    } finally {
      setActiveMethod(null)
    }
  }

  const onlineCount = cache?.members_count ?? 0
  const lastSyncStr = cache ? fmtTime(cache.synced_at) : '--:--:--'

  return (
    <div className='text-[var(--bordel-fg)] py-4'>
      {/* status row: breadcrumb left, online/lastsync right */}
      <div className='flex justify-between items-center text-xs opacity-60'>
        <span>&gt; / gate / index.cgi</span>
        <span>
          online: {String(onlineCount).padStart(2, '0')} · last sync: {lastSyncStr}
          <button
            onClick={() => syncMembers()}
            disabled={syncing || busy}
            className='ml-2 underline opacity-80 hover:opacity-100 disabled:opacity-40'>
            [{syncing ? 'syncing' : 'sync'}]
          </button>
        </span>
      </div>

      {/* hero */}
      <section className='mt-12 text-center'>
        <div className='inline-block border border-[var(--bordel-fg-muted)] px-4 py-1 text-[10px] tracking-[0.4em] opacity-60'>
          bordel / gate // v1.0.0
        </div>
        <h1 className='mt-6 text-5xl sm:text-7xl font-bold tracking-[0.4em]'>
          [ G A T E ]
        </h1>
        <p className='mt-6 text-base sm:text-lg'>prove you belong to the bordel</p>
        <p className='mt-1 text-xs opacity-60'>{'// no membership cards, only signatures.'}</p>
      </section>

      {/* two methods — HaLo NFC is the primary path; wallet is the fallback */}
      <section className='mt-10 grid sm:grid-cols-2 gap-6'>
        <MethodCard
          method='#1'
          icon={<NfcIcon />}
          title='tap your chip'
          subtitle='the bordel knows the curve'
          tag='secp256k1 / nfc'
          action='tap →'
          loading={busy && activeMethod === 'halo'}
          disabled={busy && activeMethod !== 'halo'}
          onClick={() => runProof('halo')}
        />
        <MethodCard
          method='#2'
          icon={<QrIcon />}
          title='sign with a key'
          subtitle='a wallet you already carry'
          tag='eip-712 / typed-data'
          action={isConnected ? 'sign →' : 'connect →'}
          loading={busy && activeMethod === 'eoa'}
          disabled={busy && activeMethod !== 'eoa'}
          onClick={() => runProof('eoa')}
        />
      </section>

      {/* what gets signed disclosure */}
      <section className='mt-8 border-t border-dashed border-[var(--bordel-fg-muted)] pt-4'>
        <button
          onClick={() => setRevealed((v) => !v)}
          className='w-full flex justify-between items-center text-sm hover:opacity-100 opacity-80'>
          <span>$ what gets signed</span>
          <span className='border border-[var(--bordel-fg-muted)] hover:border-[var(--bordel-fg)] px-2 py-0.5 text-xs'>
            [{revealed ? 'hide' : 'reveal'}]
          </span>
        </button>
        {revealed && (
          <div className='mt-4 text-xs grid gap-3'>
            <div className='grid sm:grid-cols-2 gap-3'>
              <label className='block'>
                <span className='opacity-60'>gate (address)</span>
                <input
                  className='mt-1 w-full bg-black border border-[var(--bordel-fg-muted)] focus:border-[var(--bordel-fg)] outline-none p-2 font-mono'
                  value={gate}
                  onChange={(e) => setGate(e.target.value as Hex)}
                  disabled={busy}
                />
              </label>
              <label className='block'>
                <span className='opacity-60'>policyHash (bytes32)</span>
                <input
                  className='mt-1 w-full bg-black border border-[var(--bordel-fg-muted)] focus:border-[var(--bordel-fg)] outline-none p-2 font-mono'
                  value={policyHash}
                  onChange={(e) => setPolicyHash(e.target.value as Hex)}
                  disabled={busy}
                />
              </label>
            </div>
            <pre className='border border-[var(--bordel-fg-muted)] p-3 overflow-x-auto leading-relaxed opacity-90'>
{`EIP712Domain {
  name              "ZKAccess"
  version           "1"
  chainId           ${chainId}
  verifyingContract ${ZERO_ADDRESS}
}

AccessRequest {
  gate        address      ${gate}
  challenge   bytes32      <random 32 bytes per click>
  policyHash  bytes32      ${policyHash}
  issuedAt    uint256      <unix-seconds at click>
}`}
            </pre>
          </div>
        )}
      </section>

      {/* result */}
      {(status !== 'idle' || errorMsg || proof) && (
        <section className='mt-8 grid gap-3'>
          <StatusLine status={status} />
          {errorMsg && (
            <div className='border border-[var(--bordel-err)] text-[var(--bordel-err)] p-3 text-xs break-all'>
              ! {errorMsg}
            </div>
          )}
          {(lastDigest || lastLeaf) && (
            <div className='text-xs opacity-80 grid gap-1'>
              {lastDigest && (
                <div>
                  <span className='opacity-50'>digest    </span>
                  <span className='break-all'>{lastDigest}</span>
                </div>
              )}
              {lastLeaf && (
                <div>
                  <span className='opacity-50'>leaf      </span>
                  <span className='break-all'>{lastLeaf}</span>
                </div>
              )}
            </div>
          )}
          {proof && (
            <CornerBox active>
              <div className='flex justify-between items-baseline'>
                <span className='text-xs opacity-60'>verification</span>
                <span
                  className={
                    verified === null
                      ? 'opacity-60'
                      : verified
                        ? 'text-[var(--bordel-fg)]'
                        : 'text-[var(--bordel-err)]'
                  }>
                  {verified === null ? '…' : verified ? '[VALID]' : '[INVALID]'}
                </span>
              </div>
              <div className='mt-3 text-xs opacity-80'>
                <div>
                  <span className='opacity-50'>proof bytes  </span>
                  <span className='break-all'>{truncate(bytesToHex(proof.proof), 18, 14)} ({proof.proof.length}b)</span>
                </div>
                <div className='mt-2'>
                  <span className='opacity-50'>public inputs ({proof.publicInputs.length}):</span>
                  <ul className='mt-1 text-[11px] break-all opacity-90'>
                    {proof.publicInputs.map((pi, i) => (
                      <li key={i} className='before:content-["·_"] before:opacity-40'>
                        {pi}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CornerBox>
          )}
        </section>
      )}

      {address && (
        <p className='mt-6 text-[10px] opacity-40 break-all'>
          connected: {address}
        </p>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// presentational

function CornerBox({
  children,
  className = '',
  active = false,
}: {
  children: ReactNode
  className?: string
  active?: boolean
}) {
  const border = active ? 'border-[var(--bordel-fg)]' : 'border-[var(--bordel-fg-muted)]'
  return (
    <div className={`relative border ${border} p-4 ${className}`}>
      <Plus pos='top-0 left-0' offset='-translate-x-1/2 -translate-y-1/2' />
      <Plus pos='top-0 right-0' offset='translate-x-1/2 -translate-y-1/2' />
      <Plus pos='bottom-0 left-0' offset='-translate-x-1/2 translate-y-1/2' />
      <Plus pos='bottom-0 right-0' offset='translate-x-1/2 translate-y-1/2' />
      {children}
    </div>
  )
}

function Plus({ pos, offset }: { pos: string; offset: string }) {
  return (
    <span
      className={`absolute ${pos} ${offset} bg-black px-[2px] text-[var(--bordel-fg)] leading-none text-xs select-none pointer-events-none`}
      aria-hidden>
      +
    </span>
  )
}

function MethodCard({
  method,
  icon,
  title,
  subtitle,
  tag,
  action,
  loading,
  disabled,
  onClick,
}: {
  method: string
  icon: ReactNode
  title: string
  subtitle: string
  tag: string
  action: string
  loading: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <CornerBox active={loading} className='min-h-[180px] flex flex-col'>
      <div className='flex items-center gap-3 text-xs opacity-60'>
        <span className='w-6 h-6 inline-flex items-center justify-center'>{icon}</span>
        <span className='tracking-[0.3em]'>METHOD {method}</span>
      </div>
      <h3 className='mt-4 text-2xl text-[var(--bordel-fg)]'>{title}</h3>
      <p className='mt-1 text-sm opacity-70'>{subtitle}</p>
      <div className='mt-auto pt-4 flex justify-between items-baseline text-xs'>
        <span className='opacity-60'>{tag}</span>
        <button
          onClick={onClick}
          disabled={disabled || loading}
          className='border border-[var(--bordel-fg-muted)] hover:border-[var(--bordel-fg)] px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed'>
          {loading ? <span className='animate-pulse'>...</span> : action.toUpperCase()}
        </button>
      </div>
    </CornerBox>
  )
}

function StatusLine({ status }: { status: Status }) {
  const labels: Record<Status, string> = {
    idle: 'idle',
    signing: 'awaiting signature',
    proving: 'generating proof',
    verifying: 'verifying',
    done: 'done',
    error: 'error',
  }
  return (
    <div className='text-xs opacity-80'>
      <span className='opacity-50'>state    </span>
      <span>{labels[status]}</span>
      <span className='animate-pulse'>_</span>
    </div>
  )
}

function QrIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5' className='w-5 h-5'>
      <rect x='1' y='1' width='5' height='5' />
      <rect x='10' y='1' width='5' height='5' />
      <rect x='1' y='10' width='5' height='5' />
      <rect x='9' y='9' width='2' height='2' fill='currentColor' />
      <rect x='13' y='9' width='2' height='2' fill='currentColor' />
      <rect x='9' y='13' width='2' height='2' fill='currentColor' />
      <rect x='13' y='13' width='2' height='2' fill='currentColor' />
    </svg>
  )
}

function NfcIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' className='w-5 h-5'>
      <path d='M3 3 Q 8 8 3 13' />
      <path d='M6 3 Q 11 8 6 13' />
      <path d='M9 3 Q 14 8 9 13' />
    </svg>
  )
}

// -----------------------------------------------------------------------------

async function signWithHalo(digest: Hex): Promise<Hex> {
  const execHaloCmdWeb = await loadHaloCmd()
  const res = await execHaloCmdWeb({
    name: 'sign',
    keyNo: HALO_KEY_SLOT,
    digest: digest.slice(2),
  })
  const ether = res?.signature?.ether
  if (typeof ether !== 'string') throw new Error('halo did not return signature.ether')
  return (ether.startsWith('0x') ? ether : `0x${ether}`) as Hex
}

