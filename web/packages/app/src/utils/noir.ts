import type { CompiledCircuit, Noir } from '@noir-lang/noir_js'
import type { UltraHonkBackend } from '@aztec/bb.js'
import { type EcdsaValidatorInput } from './circuits/ecdsa_validator'
// Bundle the compiled circuit into the JS chunk instead of fetching it at
// runtime. The runtime fetch path used to break behind LAN proxies / tunnels
// (502 Bad Gateway from the proxy when the dev server stalled) and added a
// network hop on every cold load. Static import = always available, works
// offline, no proxy hop. Bundle cost: ~84 kB raw, ~30 kB gzipped.
//
// JSON import widens string literal types like { kind: "array" } to plain
// `string`, which doesn't satisfy CompiledCircuit's discriminated union. The
// runtime data is correct (it came from `nargo compile`), so we cast.
import circuitJson from './circuits/ecdsa_validator.json'
const circuit = circuitJson as unknown as CompiledCircuit

export type EcdsaCircuitInput = EcdsaValidatorInput

export type ProofResult = Awaited<ReturnType<UltraHonkBackend['generateProof']>>

let cached: Promise<{ noir: Noir; backend: UltraHonkBackend }> | null = null

async function init() {
  if (cached) return cached
  cached = (async () => {
    const [{ Noir }, { Barretenberg, UltraHonkBackend }] = await Promise.all([
      import('@noir-lang/noir_js'),
      import('@aztec/bb.js'),
    ])
    const noir = new Noir(circuit)
    // Limit worker threads on memory-constrained devices. Each thread allocates
    // its own WASM heap copy; 2 is a sane balance between throughput and
    // mobile-Safari's ~1 GB tab budget.
    const bb = await Barretenberg.new({ threads: 2 })
    // Size the CRS to exactly what this circuit needs. The default is too small
    // ("trying to get too many points in MemBn254CrsFactory!") and over-
    // provisioning to 2^20 OOMs mobile Safari. Query the dyadic circuit size
    // and load just enough.
    const bytecodeBytes = base64ToBytes(circuit.bytecode)
    let srsSize: number
    try {
      const [, dyadic] = await bb.acirGetCircuitSizes(bytecodeBytes, false, true)
      srsSize = dyadic + 1
    } catch {
      // Fallback if the API ever changes shape: the smallest size known to
      // satisfy our current circuit per the prior runtime error (524288).
      srsSize = 2 ** 19 + 1
    }
    await bb.initSRSChonk(srsSize)
    const backend = new UltraHonkBackend(circuit.bytecode, bb)
    return { noir, backend }
  })()
  return cached
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
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
