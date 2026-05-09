import type { Noir } from '@noir-lang/noir_js'
import type { UltraHonkBackend } from '@aztec/bb.js'

export type EcdsaCircuitInput = {
  pub_key_x: number[]
  pub_key_y: number[]
  signature: number[]
  hashed_message: number[]
}

export type ProofResult = Awaited<ReturnType<UltraHonkBackend['generateProof']>>

let cached: Promise<{ noir: Noir; backend: UltraHonkBackend }> | null = null

async function init() {
  if (cached) return cached
  cached = (async () => {
    const [{ Noir }, { Barretenberg, UltraHonkBackend }, circuitRes] = await Promise.all([
      import('@noir-lang/noir_js'),
      import('@aztec/bb.js'),
      fetch('/circuits/ecdsa_validator.json'),
    ])
    if (!circuitRes.ok) throw new Error(`Failed to load circuit: ${circuitRes.status}`)
    const circuit = await circuitRes.json()
    const noir = new Noir(circuit)
    const bb = await Barretenberg.new()
    const backend = new UltraHonkBackend(circuit.bytecode, bb)
    return { noir, backend }
  })()
  return cached
}

export async function generateProof(input: EcdsaCircuitInput): Promise<ProofResult> {
  const { noir, backend } = await init()
  const { witness } = await noir.execute(input)
  return backend.generateProof(witness)
}

export async function verifyProof(proof: ProofResult): Promise<boolean> {
  const { backend } = await init()
  return backend.verifyProof(proof)
}
