'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useChainId, useSignTypedData } from 'wagmi'
import { getAddress, isAddress } from 'viem'
import { useNotifications } from '@/context/Notifications'
import { AddressInput } from '@/components/AddressInput'
import {
  ENROLLMENT_PRIMARY_TYPE,
  enrollmentDomain,
  enrollmentTypes,
  randomBytes32,
} from '@/utils/eip712'

type Hex = `0x${string}`
type Mode = 'halo' | 'wallet' | 'pubkey'

type Member = {
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

type MembersDb = {
  version: 1
  tree_depth: number
  members: Member[]
  root: Hex
}

type MemberCard = {
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

const truncate = (hex: string, head = 10, tail = 8) =>
  hex.length <= head + tail + 3 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`

const safeChecksum = (a: string): string | null => {
  try {
    return getAddress(a as Hex)
  } catch {
    return null
  }
}

export default function AdminPage() {
  const { Add } = useNotifications()
  const { address: connectedAddress, isConnected } = useAccount()
  const chainId = useChainId()
  const { signTypedDataAsync } = useSignTypedData()

  const [db, setDb] = useState<MembersDb | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('halo')
  const [name, setName] = useState('')
  const [pubkeyHex, setPubkeyHex] = useState('')
  const [claimedAddress, setClaimedAddress] = useState<string>('')
  const [claimedAddressIsValid, setClaimedAddressIsValid] = useState(false)
  const [addressInputResetKey, setAddressInputResetKey] = useState(0)
  const [capabilities, setCapabilities] = useState('door')
  const [tier, setTier] = useState('member')
  const [submitting, setSubmitting] = useState(false)
  const [haloBusy, setHaloBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/members', { cache: 'no-store' })
      if (!res.ok) throw new Error(`GET /api/admin/members ${res.status}`)
      const data = (await res.json()) as MembersDb
      setDb(data)
    } catch (err) {
      Add(`Load failed: ${err instanceof Error ? err.message : String(err)}`, { type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [Add])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Clear mode-specific fields when switching modes so a stale value can't be
  // submitted accidentally. Shared fields (name, capabilities, tier) persist.
  const switchMode = (next: Mode) => {
    if (next === mode) return
    setPubkeyHex('')
    setClaimedAddress('')
    setClaimedAddressIsValid(false)
    setAddressInputResetKey((k) => k + 1)
    setMode(next)
  }

  const tapHalo = async () => {
    setHaloBusy(true)
    try {
      // Lazy-load libhalo: large bundle, only needed when admin actually taps a tag.
      const { execHaloCmdWeb } = await import('@arx-research/libhalo/api/web')
      const res = (await execHaloCmdWeb({ name: 'get_pkeys' })) as {
        publicKeys: Record<string, string>
      }
      const pk1 = res.publicKeys?.['1']
      if (!pk1) throw new Error('HaLo did not return publicKeys[1]')
      setPubkeyHex(pk1.startsWith('0x') ? pk1 : `0x${pk1}`)
      Add(`Read pubkey from HaLo slot 1`, { type: 'success' })
    } catch (err) {
      Add(`HaLo read failed: ${err instanceof Error ? err.message : String(err)}`, { type: 'error' })
    } finally {
      setHaloBusy(false)
    }
  }

  const enrollViaPubkey = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'pubkey',
          name: name.trim(),
          pubkey_hex: pubkeyHex.trim(),
          capabilities: parseCapabilities(capabilities),
          tier: tier.trim(),
        }),
      })
      const body = (await res.json()) as { member?: Member; error?: string }
      if (!res.ok) throw new Error(body.error ?? `enroll failed (${res.status})`)
      Add(`Enrolled ${body.member?.name} at index ${body.member?.leaf_index}`, { type: 'success' })
      setName('')
      setPubkeyHex('')
      await refresh()
    } catch (err) {
      Add(`Enroll failed: ${err instanceof Error ? err.message : String(err)}`, { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const enrollViaSignature = async () => {
    if (!isConnected) {
      Add('Connect a wallet first (header → connect)', { type: 'error' })
      return
    }
    if (!claimedAddressIsValid || !isAddress(claimedAddress)) {
      Add('Enter a valid Ethereum address', { type: 'error' })
      return
    }
    if (!name.trim()) {
      Add('Name is required', { type: 'error' })
      return
    }

    setSubmitting(true)
    try {
      const checksummedAddr = getAddress(claimedAddress as Hex)
      const message = {
        name: name.trim().toLowerCase(),
        address: checksummedAddr,
        nonce: randomBytes32(),
        issuedAt: BigInt(Math.floor(Date.now() / 1000)),
      }

      const signature = (await signTypedDataAsync({
        domain: enrollmentDomain(chainId),
        types: enrollmentTypes,
        primaryType: ENROLLMENT_PRIMARY_TYPE,
        message,
      })) as Hex

      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'signature',
          name: message.name,
          address: message.address,
          signature,
          message: { ...message, issuedAt: message.issuedAt.toString() },
          chainId,
          capabilities: parseCapabilities(capabilities),
          tier: tier.trim(),
        }),
      })
      const body = (await res.json()) as { member?: Member; error?: string }
      if (!res.ok) throw new Error(body.error ?? `enroll failed (${res.status})`)
      Add(`Enrolled ${body.member?.name} at index ${body.member?.leaf_index}`, { type: 'success' })
      setName('')
      setClaimedAddress('')
      setClaimedAddressIsValid(false)
      setAddressInputResetKey((k) => k + 1)
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Common wallet-rejection codes/messages — soften the toast.
      if (/user rejected|rejected the request|denied|4001/i.test(msg)) {
        Add('Signature cancelled', { type: 'info' })
      } else {
        Add(`Enroll failed: ${msg}`, { type: 'error' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const downloadCard = async (index: number, name: string) => {
    try {
      const res = await fetch(`/api/admin/cards/${index}`, { cache: 'no-store' })
      const card = (await res.json()) as MemberCard | { error: string }
      if (!res.ok || 'error' in card) {
        throw new Error('error' in card ? card.error : `card fetch ${res.status}`)
      }
      const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `member-card-${index}-${name}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      Add(`Card download failed: ${err instanceof Error ? err.message : String(err)}`, { type: 'error' })
    }
  }

  const copy = async (s: string, label: string) => {
    try {
      await navigator.clipboard.writeText(s)
      Add(`Copied ${label}`, { type: 'success' })
    } catch {
      Add('Clipboard write failed', { type: 'error' })
    }
  }

  const claimedChecksum = useMemo(() => safeChecksum(claimedAddress), [claimedAddress])
  const connectedChecksum = useMemo(
    () => (connectedAddress ? safeChecksum(connectedAddress) : null),
    [connectedAddress],
  )
  const addressMismatch =
    isConnected &&
    claimedChecksum !== null &&
    connectedChecksum !== null &&
    claimedChecksum !== connectedChecksum

  const submitDisabled =
    submitting ||
    !name.trim() ||
    (mode === 'halo' && !pubkeyHex.trim()) ||
    (mode === 'pubkey' && !pubkeyHex.trim()) ||
    (mode === 'wallet' && (!claimedAddressIsValid || !isConnected))

  const onSubmit = () => {
    if (mode === 'wallet') void enrollViaSignature()
    else void enrollViaPubkey()
  }

  return (
    <div className='flex-column align-center'>
      <h1 className='text-xl'>Admin · Member enrollment</h1>
      <p className='mt-2 text-sm opacity-80'>
        Enroll a member by HaLo tap, by wallet signature, or by raw pubkey. Each enrollment recomputes the Merkle
        root; copy the new root and (later) write it to <code>bordel.member-root</code> on the resolver. State is
        persisted to <code>web/packages/app/data/members.json</code>.
      </p>
      <p className='mt-2 text-xs opacity-60'>
        Dev-only: API has no auth. Don&apos;t expose this build to the public internet.
      </p>

      <div className='mt-6 stats shadow-sm bg-[#282c33] w-full'>
        <div className='stat'>
          <div className='stat-title'>Members</div>
          <div className='stat-value text-2xl'>{db?.members.length ?? '…'}</div>
          <div className='stat-desc'>tree depth {db?.tree_depth ?? 16}</div>
        </div>
        <div className='stat'>
          <div className='stat-title'>Current root</div>
          <div className='stat-value text-base font-mono'>{db ? truncate(db.root, 12, 10) : '…'}</div>
          <div className='stat-desc'>
            {db && (
              <button className='btn btn-xs mt-1' onClick={() => copy(db.root, 'root')}>
                Copy root
              </button>
            )}
          </div>
        </div>
      </div>

      <div className='mt-6 w-full grid gap-3'>
        <h2 className='text-lg'>Enroll new member</h2>

        <div role='tablist' className='tabs tabs-boxed'>
          <button
            role='tab'
            className={`tab ${mode === 'halo' ? 'tab-active' : ''}`}
            onClick={() => switchMode('halo')}
            disabled={submitting}>
            HaLo NFC
          </button>
          <button
            role='tab'
            className={`tab ${mode === 'wallet' ? 'tab-active' : ''}`}
            onClick={() => switchMode('wallet')}
            disabled={submitting}>
            Wallet sign-in
          </button>
          <button
            role='tab'
            className={`tab ${mode === 'pubkey' ? 'tab-active' : ''}`}
            onClick={() => switchMode('pubkey')}
            disabled={submitting}>
            Paste pubkey
          </button>
        </div>

        <label className='form-control w-full'>
          <div className='label'>
            <span className='label-text'>Name (ENS subname leaf)</span>
          </div>
          <input
            className='input input-bordered w-full font-mono text-sm'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. skas'
            disabled={submitting}
          />
        </label>

        {mode === 'halo' && (
          <label className='form-control w-full'>
            <div className='label'>
              <span className='label-text'>Pubkey from HaLo (slot 1)</span>
            </div>
            <input
              className='input input-bordered w-full font-mono text-xs'
              value={pubkeyHex}
              onChange={(e) => setPubkeyHex(e.target.value)}
              placeholder='Tap the tag to populate'
              disabled={submitting}
            />
            <div className='label'>
              <button
                type='button'
                className='btn btn-sm'
                onClick={tapHalo}
                disabled={haloBusy || submitting}>
                {haloBusy ? <span className='loading loading-dots loading-xs'></span> : 'Tap HaLo (slot 1)'}
              </button>
            </div>
          </label>
        )}

        {mode === 'pubkey' && (
          <label className='form-control w-full'>
            <div className='label'>
              <span className='label-text'>
                Pubkey (uncompressed, 0x04 + 64 bytes hex; or 64 bytes X||Y)
              </span>
            </div>
            <input
              className='input input-bordered w-full font-mono text-xs'
              value={pubkeyHex}
              onChange={(e) => setPubkeyHex(e.target.value)}
              placeholder='0x04...'
              disabled={submitting}
            />
          </label>
        )}

        {mode === 'wallet' && (
          <div className='form-control w-full'>
            <div className='label'>
              <span className='label-text'>Claimed address (or ENS name)</span>
            </div>
            <AddressInput
              key={addressInputResetKey}
              onRecipientChange={(addr, valid) => {
                setClaimedAddress(addr)
                setClaimedAddressIsValid(valid)
              }}
              disabled={submitting}
            />
            <div className='label flex flex-wrap gap-2'>
              <button
                type='button'
                className='btn btn-sm'
                onClick={() => {
                  if (!connectedAddress) {
                    Add('Connect a wallet first', { type: 'error' })
                    return
                  }
                  setClaimedAddress(connectedAddress)
                  setClaimedAddressIsValid(true)
                  setAddressInputResetKey((k) => k + 1)
                }}
                disabled={!isConnected || submitting}>
                Use connected wallet
              </button>
              {!isConnected && (
                <span className='text-xs opacity-70'>Connect a wallet from the header.</span>
              )}
            </div>
            <div className='text-xs mt-1'>
              <span className='opacity-70'>Will enroll: </span>
              {claimedChecksum ? (
                <span className='font-mono'>{claimedChecksum}</span>
              ) : (
                <span className='opacity-50'>— (type an address, click an ENS resolution, or use the connected wallet)</span>
              )}
            </div>
            {addressMismatch && (
              <div className='alert alert-warning text-xs mt-1'>
                <span>
                  Connected wallet ({truncate(connectedChecksum ?? '', 8, 6)}) differs from the claimed address (
                  {truncate(claimedChecksum ?? '', 8, 6)}). The signature prompt will come from the connected
                  wallet, and the server will reject the enrollment if the recovered address doesn&apos;t match.
                </span>
              </div>
            )}
            <p className='text-xs opacity-60 mt-1'>
              The user signs an EIP-712 <code>MembershipEnrollment</code> message. The server recovers the
              pubkey from the signature and verifies it derives to the claimed address.
            </p>
          </div>
        )}

        <label className='form-control w-full'>
          <div className='label'>
            <span className='label-text'>Capabilities (comma-separated)</span>
          </div>
          <input
            className='input input-bordered w-full font-mono text-xs'
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            placeholder='door, kitchen, freezer'
            disabled={submitting}
          />
        </label>

        <label className='form-control w-full'>
          <div className='label'>
            <span className='label-text'>Tier</span>
          </div>
          <input
            className='input input-bordered w-full font-mono text-xs'
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            placeholder='member | core'
            disabled={submitting}
          />
        </label>

        <div className='mt-2'>
          <button className='btn btn-wide' onClick={onSubmit} disabled={submitDisabled}>
            {submitting ? (
              <span className='loading loading-dots loading-sm'></span>
            ) : mode === 'wallet' ? (
              'Sign EIP-712 & enroll'
            ) : (
              'Enroll'
            )}
          </button>
        </div>
      </div>

      <div className='mt-8 w-full'>
        <div className='flex items-center justify-between'>
          <h2 className='text-lg'>Enrolled members</h2>
          <button className='btn btn-sm' onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
        <div className='mt-2 overflow-x-auto'>
          <table className='table table-sm'>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Address</th>
                <th>Leaf</th>
                <th>Tier</th>
                <th>Capabilities</th>
                <th>Card</th>
              </tr>
            </thead>
            <tbody>
              {(db?.members ?? []).map((m) => (
                <tr key={m.leaf_index}>
                  <td>{m.leaf_index}</td>
                  <td className='font-mono'>{m.name}</td>
                  <td className='font-mono text-xs'>{truncate(m.ether_address, 8, 6)}</td>
                  <td className='font-mono text-xs'>{truncate(m.leaf, 8, 6)}</td>
                  <td>{m.tier}</td>
                  <td className='text-xs'>{m.capabilities.join(', ') || '—'}</td>
                  <td>
                    <button
                      className='btn btn-xs'
                      onClick={() => downloadCard(m.leaf_index, m.name)}>
                      Download
                    </button>
                  </td>
                </tr>
              ))}
              {db && db.members.length === 0 && (
                <tr>
                  <td colSpan={7} className='text-center opacity-60 py-4'>
                    No members yet — enroll the first one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function parseCapabilities(input: string): string[] {
  return input
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}
