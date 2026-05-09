'use client'

import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { hashMessage, hexToBytes, recoverPublicKey } from 'viem'
import { useNotifications } from '@/context/Notifications'
import { generateProof, verifyProof, type ProofResult } from '@/utils/noir'

type Status = 'idle' | 'signing' | 'proving' | 'verifying' | 'done' | 'error'

const truncate = (hex: string, head = 10, tail = 8) =>
  hex.length <= head + tail + 3 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`

const toHex = (bytes: Uint8Array) =>
  '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export default function ProveSignaturePage() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { Add } = useNotifications()

  const [message, setMessage] = useState('Hello Noir')
  const [status, setStatus] = useState<Status>('idle')
  const [proof, setProof] = useState<ProofResult | null>(null)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const busy = status === 'signing' || status === 'proving' || status === 'verifying'

  const handleProve = async () => {
    setProof(null)
    setVerified(null)
    setErrorMsg(null)
    try {
      setStatus('signing')
      const signatureHex = await signMessageAsync({ message })
      const sigBytes = hexToBytes(signatureHex)
      if (sigBytes.length !== 65) throw new Error(`Unexpected signature length: ${sigBytes.length}`)

      const digestBytes = hexToBytes(hashMessage(message))
      const pubKeyHex = await recoverPublicKey({ hash: hashMessage(message), signature: signatureHex })
      const pubKeyBytes = hexToBytes(pubKeyHex)
      if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
        throw new Error('Recovered pubkey is not in uncompressed form')
      }

      const input = {
        pub_key_x: Array.from(pubKeyBytes.slice(1, 33)),
        pub_key_y: Array.from(pubKeyBytes.slice(33, 65)),
        signature: Array.from(sigBytes.slice(0, 64)),
        hashed_message: Array.from(digestBytes),
      }

      setStatus('proving')
      const generated = await generateProof(input)
      setProof(generated)

      setStatus('verifying')
      const ok = await verifyProof(generated)
      setVerified(ok)
      setStatus('done')

      Add(ok ? 'Proof verified offchain' : 'Proof verification failed', {
        type: ok ? 'success' : 'error',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg)
      setStatus('error')
      Add(`Proof flow failed: ${msg}`, { type: 'error' })
    }
  }

  return (
    <div className='flex-column align-center'>
      <h1 className='text-xl'>Prove ECDSA Signature with Noir</h1>
      <p className='mt-2 text-sm opacity-80'>
        Sign a message with your wallet, then generate a Noir proof in the browser that the signature is valid for the
        recovered secp256k1 public key. The pubkey and signature stay private to the circuit; only the message hash is
        public. Verification runs offchain in your browser.
      </p>

      <label className='form-control w-full mt-6'>
        <div className='label'>
          <span className='label-text'>Message to sign</span>
        </div>
        <textarea
          className='textarea textarea-bordered w-full'
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
        />
      </label>

      <div className='mt-4 flex gap-3 items-center'>
        <button
          className='btn btn-wide'
          onClick={handleProve}
          disabled={busy || !address || message.length === 0}>
          {busy ? <span className='loading loading-dots loading-sm'></span> : 'Sign & Prove'}
        </button>
        {!address && <span className='text-sm opacity-70'>Connect your wallet to begin.</span>}
      </div>

      {status !== 'idle' && (
        <div className='mt-4 text-sm'>
          <span className='opacity-70'>Status: </span>
          <span className='font-mono'>{status}</span>
        </div>
      )}

      {errorMsg && (
        <div className='alert alert-error mt-4'>
          <span className='break-all'>{errorMsg}</span>
        </div>
      )}

      {proof && (
        <div className='mt-6 w-full'>
          <div className='stats shadow-sm bg-[#282c33] w-full'>
            <div className='stat'>
              <div className='stat-title'>Verification</div>
              <div className={`stat-value text-2xl ${verified ? 'text-success' : 'text-error'}`}>
                {verified === null ? '…' : verified ? 'Valid ✓' : 'Invalid ✗'}
              </div>
              <div className='stat-desc'>backend.verifyProof — offchain, in browser</div>
            </div>
          </div>

          <div className='mt-4 grid gap-2 text-sm'>
            <div>
              <span className='opacity-70'>Proof bytes ({proof.proof.length}): </span>
              <span className='font-mono break-all'>{truncate(toHex(proof.proof), 18, 14)}</span>
            </div>
            <div>
              <span className='opacity-70'>Public inputs ({proof.publicInputs.length}):</span>
              <ul className='font-mono text-xs mt-1 break-all list-disc list-inside'>
                {proof.publicInputs.map((pi, i) => (
                  <li key={i}>{pi}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
