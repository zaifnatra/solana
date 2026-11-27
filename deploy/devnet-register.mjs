// Explicit devnet registration; never import staging's faucet/scenario runner.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'staging/package.json'));
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require('@solana/web3.js');
const RPC = 'https://api.devnet.solana.com';
const GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');
const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const state = resolve(root, 'deploy/devnet-state');
const discriminator = name => createHash('sha256').update(name).digest().subarray(0, 8);
const fail = message => { throw new Error(message); };

function keypair(path) {
  const full = realpathSync(resolve(root, path));
  const subpath = relative(realpathSync(resolve(state, 'keys')), full);
  if (!subpath || subpath.startsWith('..') || isAbsolute(subpath)) fail('Keypair must be inside dedicated devnet keys directory');
  if ((statSync(full).mode & 0o077) !== 0 || statSync(full).size > 4096) fail('Keypair permissions/size invalid');
  const bytes = JSON.parse(readFileSync(full, 'utf8'));
  if (!Array.isArray(bytes) || bytes.length !== 64 || bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) fail('Invalid keypair file');
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function run() {
  if (process.argv.length !== 3) fail('Usage: node deploy/devnet-register.mjs deploy/devnet.config.json');
  const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (config.version !== 1 || config.cluster !== 'devnet' || config.rpc_url !== RPC || config.genesis_hash !== GENESIS) fail('Only explicit devnet configuration is supported');
  if (!Array.isArray(config.artists) || config.artists.length < 1 || config.artists.length > 16) fail('Configure 1–16 artists');
  const connection = new Connection(RPC, 'finalized');
  if (await connection.getGenesisHash() !== GENESIS) fail('RPC genesis mismatch');
  const payer = keypair(config.payer_keypair);
  const program = keypair(config.program_keypair).publicKey;
  const fee = keypair(config.fee_wallet_keypair).publicKey;
  if (fee.toBase58() !== config.platform_wallet) fail('Fee wallet does not match chosen keypair');
  const programAccount = await connection.getAccountInfo(program, 'finalized');
  if (!programAccount?.executable || !programAccount.owner.equals(LOADER)) fail('Expected deployed upgradeable devnet program was not found');
  // Check deployed bytes against the locally built artifact before registering.
  // Upgradeable Program account = u32 enum discriminant 2 + ProgramData pubkey.
  if (programAccount.data.length !== 36 || programAccount.data.readUInt32LE(0) !== 2) fail('Unexpected program-account layout');
  const programDataAddress = new PublicKey(programAccount.data.subarray(4, 36));
  const programData = await connection.getAccountInfo(programDataAddress, 'finalized');
  if (!programData || !programData.owner.equals(LOADER) || programData.data.readUInt32LE(0) !== 3 || programData.data.length < 45) fail('Invalid program data account');
  // ProgramData metadata occupies 45 bytes with an active upgrade authority.
  if (programData.data[12] !== 1 || !new PublicKey(programData.data.subarray(13, 45)).equals(payer.publicKey)) fail('Unexpected upgrade authority; this devnet workflow expects the configured payer');
  const binary = readFileSync(resolve(state, 'workspace/target/deploy/sol_proj.so'));
  if (!programData.data.subarray(45, 45 + binary.length).equals(binary) || programData.data.subarray(45 + binary.length).some(byte => byte !== 0)) fail('Deployed program bytes do not match the local build');
  const feeAccount = await connection.getAccountInfo(fee, 'finalized');
  if (!feeAccount || !feeAccount.owner.equals(SystemProgram.programId) || feeAccount.data.length !== 0) fail('Fund the chosen devnet fee wallet first; it must be an ordinary system wallet');
  const markets = [];
  const symbols = new Set();
  const authorities = new Set();
  for (const artist of config.artists) {
    if (typeof artist.symbol !== 'string' || !/^[A-Z][A-Z0-9]{1,11}$/.test(artist.symbol) || symbols.has(artist.symbol)) fail('Invalid or duplicate artist symbol');
    if (typeof artist.name !== 'string' || !artist.name.trim() || artist.name.length > 80) fail('Invalid artist name');
    const authority = keypair(artist.keypair);
    if (authorities.has(authority.publicKey.toBase58()) || authority.publicKey.equals(program) || payer.publicKey.equals(program) || fee.equals(program)) fail('Program identity must be separate and artist authorities unique');
    symbols.add(artist.symbol); authorities.add(authority.publicKey.toBase58());
    const [profile, bump] = PublicKey.findProgramAddressSync([Buffer.from('artist'), authority.publicKey.toBuffer()], program);
    const [mint] = PublicKey.findProgramAddressSync([Buffer.from('mint'), authority.publicKey.toBuffer()], program);
    let [profileAccount, mintAccount] = await connection.getMultipleAccountsInfo([profile, mint], 'finalized');
    if (!profileAccount && !mintAccount) {
      // Recheck immediately before the only transaction-producing operation.
      if (await connection.getGenesisHash() !== GENESIS) fail('RPC genesis changed');
      const instruction = new TransactionInstruction({
        programId: program,
        keys: [
          {pubkey: authority.publicKey, isSigner: true, isWritable: true},
          {pubkey: profile, isSigner: false, isWritable: true},
          {pubkey: mint, isSigner: false, isWritable: true},
          {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
          {pubkey: TOKEN, isSigner: false, isWritable: false},
          {pubkey: RENT, isSigner: false, isWritable: false},
        ],
        data: discriminator('global:register_artist'),
      });
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = payer.publicKey;
      const signers = payer.publicKey.equals(authority.publicKey) ? [payer] : [payer, authority];
      await sendAndConfirmTransaction(connection, transaction, signers, {commitment: 'finalized', preflightCommitment: 'finalized'});
      [profileAccount, mintAccount] = await connection.getMultipleAccountsInfo([profile, mint], 'finalized');
    }
    if (!profileAccount || !profileAccount.owner.equals(program) || profileAccount.data.length < 81 || !profileAccount.data.subarray(0, 8).equals(discriminator('account:ArtistProfile')) || !new PublicKey(profileAccount.data.subarray(8, 40)).equals(authority.publicKey) || !new PublicKey(profileAccount.data.subarray(40, 72)).equals(mint) || profileAccount.data[80] !== bump) fail('Artist profile failed verification');
    if (!mintAccount || !mintAccount.owner.equals(TOKEN) || mintAccount.data.length !== 82 || mintAccount.data.readUInt32LE(0) !== 1 || !new PublicKey(mintAccount.data.subarray(4, 36)).equals(profile) || mintAccount.data[44] !== 0 || mintAccount.data[45] !== 1 || mintAccount.data.readUInt32LE(46) !== 1 || !new PublicKey(mintAccount.data.subarray(50, 82)).equals(profile)) fail('Artist mint failed verification');
    const curveSupply = profileAccount.data.readBigUInt64LE(72);
    const mintedSupply = mintAccount.data.readBigUInt64LE(36);
    // A holder can burn SPL tokens directly without redeeming the curve reserve.
    // This reduces actual mint supply without decrementing the curve counter.
    if (curveSupply > 100_000n || mintedSupply > curveSupply) fail('Invalid profile/mint supply relationship');
    markets.push({symbol: artist.symbol, name: artist.name, artist_authority: authority.publicKey.toBase58(), artist_profile: profile.toBase58(), token_mint: mint.toBase58()});
  }
  const manifest = {version: 1, abi_version: 2, cluster: 'devnet', genesis_hash: GENESIS, program_id: program.toBase58(), platform_wallet: fee.toBase58(), markets};
  mkdirSync(resolve(state, 'public'), {recursive: true, mode: 0o700});
  writeFileSync(resolve(state, 'public/devnet-markets.json'), JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});
  console.log('Devnet accounts verified; public manifest generated. No keys are included.');
}

run().catch(error => {
  console.error(`Devnet registration stopped: ${error.message}`);
  process.exitCode = 1;
});
