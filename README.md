# Bordel-Gate WIP

Privacy-preserving onchain and offchain authentication for the BORDEL hackerspace.

Members can create ZK proof to enter online or physical gated spaces. In meatspace, Bordel members can use an NFC chip to open a door, a fridge, or any
gated capability, they prove they belong to the Bordel member set without revealing which member they are. 

Built with Noir and HaLo web NFC, work in progress

## Quickstart

Dependencies: 
- Node 20+, Yarn 1.22
- [Noir](https://noir-lang.org)
- [Foundry](https://book.getfoundry.sh).

```bash
# 1. Web app 
cd web
cp packages/app/.env.sample packages/app/.env.local   # add walleconnect ID
yarn
yarn dev                                              # run UI locally

# 2. Build the circuit
cd ../ecdsa_validator
npm install
node build_sample_tree.mjs                            # writes Prover.toml
nargo execute                                        
node generate_proof.mjs                               # generates + self-verifies a proof

# 3. Sync the compiled circuit into the web app (rerun after every circuit edit)
npm run sync
```

Simple demo (admin + member, no on-chain piece):

1. Visit `http://localhost:3000/admin`, enroll a member by NFC tap, by
   EIP-712 wallet signature, or by pasting their pubkey
2. Visit `http://localhost:3000/examples/prove-signature`, click **sync**
   to pull the latest `members.json`, then tap your card or sign with the
   wallet you just enrolled. The proof is generated and verified in the
   browser

Changing the in-circuit hash from keccak256 to Poseidon2 cut local
proving time by ~50×, easy on regular hardware
