import { LinkComponent } from '@/components/LinkComponent'
import { SITE_DESCRIPTION, SITE_NAME } from '@/utils/site'

const STEPS = [
  {
    step: '1',
    title: 'Create commitment',
    href: '/commit',
    description:
      'Enroll a member: read an ECDSA public key from a HaLo NFC chip, an EOA wallet signature, or a raw pubkey. The key is committed as a leaf in the Merkle tree and the root is recomputed.',
  },
  {
    step: '2',
    title: 'Verify',
    href: '/verify',
    description:
      'Sign a fresh challenge with the same key, then generate a Noir zero-knowledge proof that the signature is valid and the key is in the tree — without revealing the key or which member.',
  },
]

export default function Home() {
  return (
    <>
      <h2 className='text-2xl mb-2'>{SITE_NAME}</h2>
      <p className='opacity-80'>{SITE_DESCRIPTION}</p>

      <div className='mt-6 flex flex-col gap-4'>
        {STEPS.map((s) => (
          <LinkComponent key={s.href} href={s.href}>
            <div className='border border-[var(--bordel-fg-muted)] hover:border-[var(--bordel-fg)] p-4'>
              <div className='flex items-baseline gap-3'>
                <span className='border border-[var(--bordel-fg)] px-2 py-0.5 text-xs leading-none'>{s.step}</span>
                <h3 className='text-lg'>{s.title}</h3>
                <span className='ml-auto text-xs opacity-60'>{s.href} →</span>
              </div>
              <p className='mt-2 text-sm opacity-80'>{s.description}</p>
            </div>
          </LinkComponent>
        ))}
      </div>
    </>
  )
}
