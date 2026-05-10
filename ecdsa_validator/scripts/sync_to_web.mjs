#!/usr/bin/env node
// Copy the compiled circuit JSON into the web app's public/ and regenerate the
// TS input type from the ABI so the two sides cannot drift.
//
// Run after `nargo compile`:
//   npm run sync     # just sync
//   npm run build    # nargo compile && sync

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')

const CIRCUIT_NAME = 'ecdsa_validator'
const SRC_JSON = resolve(repoRoot, 'ecdsa_validator/target', `${CIRCUIT_NAME}.json`)
// public/ copy is kept for tooling that wants to fetch() it (CLI verifiers,
// docs, etc.). The runtime in noir.ts imports the src/ copy directly via
// webpack so the circuit ships in the JS chunk — no runtime fetch, no proxy
// dependency, works offline.
const DST_JSON_PUBLIC = resolve(repoRoot, 'web/packages/app/public/circuits', `${CIRCUIT_NAME}.json`)
const DST_JSON_SRC = resolve(repoRoot, 'web/packages/app/src/utils/circuits', `${CIRCUIT_NAME}.json`)
const DST_TS = resolve(repoRoot, 'web/packages/app/src/utils/circuits', `${CIRCUIT_NAME}.ts`)

const json = JSON.parse(readFileSync(SRC_JSON, 'utf8'))
const minified = JSON.stringify(json)

mkdirSync(dirname(DST_JSON_PUBLIC), { recursive: true })
writeFileSync(DST_JSON_PUBLIC, minified)

mkdirSync(dirname(DST_JSON_SRC), { recursive: true })
writeFileSync(DST_JSON_SRC, minified)

mkdirSync(dirname(DST_TS), { recursive: true })
writeFileSync(DST_TS, renderTs(json))

console.log(
  `synced ${CIRCUIT_NAME}: ${rel(SRC_JSON)} -> ${rel(DST_JSON_PUBLIC)}, ${rel(DST_JSON_SRC)}, ${rel(DST_TS)}`,
)

function rel(p) {
  return p.startsWith(repoRoot) ? p.slice(repoRoot.length + 1) : p
}

function pascal(name) {
  return name.replace(/(^|_)([a-z])/g, (_, _u, c) => c.toUpperCase())
}

function tsType(t) {
  switch (t.kind) {
    case 'boolean':
      return 'boolean'
    case 'field':
      return 'string'
    case 'integer':
      return t.width <= 32 ? 'number' : 'string | number | bigint'
    case 'array':
      return `${tsType(t.type)}[]`
    case 'string':
      return 'string'
    case 'struct': {
      const fields = t.fields
        .map((f) => `    ${f.name}: ${tsType(f.type)}`)
        .join('\n')
      return `{\n${fields}\n  }`
    }
    case 'tuple':
      return `[${t.fields.map(tsType).join(', ')}]`
    default:
      return 'unknown'
  }
}

function renderTs(circuit) {
  const inputName = `${pascal(CIRCUIT_NAME)}Input`
  const fields = circuit.abi.parameters
    .map((p) => `  ${p.name}: ${tsType(p.type)}`)
    .join('\n')
  const publicFields = circuit.abi.parameters
    .filter((p) => p.visibility === 'public')
    .map((p) => `'${p.name}'`)
    .join(', ')
  return `// AUTO-GENERATED from ${CIRCUIT_NAME}.json by ecdsa_validator/scripts/sync_to_web.mjs
// Do not edit by hand; rerun \`npm run sync\` in ecdsa_validator/ after circuit changes.

export const CIRCUIT_NAME = '${CIRCUIT_NAME}' as const
export const CIRCUIT_HASH = ${JSON.stringify(circuit.hash ?? null)} as const
export const NOIR_VERSION = ${JSON.stringify(circuit.noir_version ?? null)} as const
export const PUBLIC_PARAMS = [${publicFields}] as const

export type ${inputName} = {
${fields}
}
`
}
