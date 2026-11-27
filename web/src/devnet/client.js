import { Buffer } from 'buffer';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';

export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const UPGRADEABLE_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const PROFILE_TAG = [165, 86, 81, 235, 237, 135, 127, 170];
const BUY_TAG = [34, 39, 248, 194, 140, 154, 2, 184];
const SELL_TAG = [208, 134, 122, 98, 49, 103, 152, 175];
const U64_MAX = (1n << 64n) - 1n;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const fail = (message) => {
  throw new Error(message);
};
export function base58(bytes) {
  let n = 0n;
  for (const byte of bytes) n = n * 256n + BigInt(byte);
  let out = '';
  while (n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of bytes) {
    if (byte) break;
    out = '1' + out;
  }
  return out;
}
export function uint(value, label = 'Amount') {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    fail(`${label} is not an exact integer.`);
  if (!/^(0|[1-9][0-9]*)$/.test(String(value)))
    fail(`${label} must be a whole non-negative integer.`);
  const result = BigInt(value);
  if (result > U64_MAX) fail(`${label} exceeds the supported range.`);
  return result;
}
export function sol(value) {
  const n = uint(value);
  const fractional = (n % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${n / 1_000_000_000n}${fractional ? `.${fractional}` : ''}`;
}
function pubkey(value, label) {
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) fail('Noncanonical address');
    return key;
  } catch {
    fail(`Invalid ${label} address.`);
  }
}
export function validateManifest(value) {
  if (
    !value ||
    value.version !== 1 ||
    value.abi_version !== 2 ||
    value.cluster !== 'devnet' ||
    value.genesis_hash !== DEVNET_GENESIS
  ) {
    fail('A bounded-trade devnet manifest is required. Mainnet is disabled.');
  }
  const program = pubkey(value.program_id, 'program');
  const fee = pubkey(value.platform_wallet, 'platform wallet');
  if (!Array.isArray(value.markets) || value.markets.length > 16)
    fail('The manifest must contain at most 16 markets.');
  const symbols = new Set();
  const profiles = new Set();
  const markets = value.markets.map((market) => {
    if (!market || !/^[A-Z][A-Z0-9]{1,11}$/.test(market.symbol) || symbols.has(market.symbol))
      fail('Invalid or repeated market symbol.');
    if (typeof market.name !== 'string' || !market.name.trim() || market.name.length > 80)
      fail('Invalid market name.');
    const authority = pubkey(market.artist_authority, 'artist');
    const profile = pubkey(market.artist_profile, 'profile');
    const mint = pubkey(market.token_mint, 'mint');
    const [expectedProfile, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('artist'), authority.toBuffer()],
      program,
    );
    const [expectedMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint'), authority.toBuffer()],
      program,
    );
    if (
      !profile.equals(expectedProfile) ||
      !mint.equals(expectedMint) ||
      profiles.has(profile.toBase58())
    )
      fail('Market addresses do not match this program and artist.');
    symbols.add(market.symbol);
    profiles.add(profile.toBase58());
    return { ...market, authority, profile, mint, bump };
  });
  return { ...value, program, fee, markets };
}
export async function loadManifest(url) {
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin)
    fail('The public devnet manifest must use this website’s origin.');
  const response = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) fail('Devnet markets have not been configured on this instance.');
  const body = await response.text();
  if (body.length > 65536) fail('Devnet manifest is too large.');
  let document;
  try {
    document = JSON.parse(body);
  } catch {
    fail('Devnet markets have not been configured with a valid JSON manifest.');
  }
  return validateManifest(document);
}
export async function verifyNetwork(connection, manifest) {
  if ((await connection.getGenesisHash()) !== DEVNET_GENESIS)
    fail('Wrong Solana network. Trading is restricted to devnet.');
  const program = await connection.getAccountInfo(manifest.program, 'confirmed');
  if (!program?.executable || !program.owner.equals(UPGRADEABLE_LOADER))
    fail('The configured devnet program is not deployed.');
}
function sameBytes(data, expected, offset = 0) {
  return expected.every((byte, index) => data[offset + index] === byte);
}
function keyAt(bytes, offset) {
  return new PublicKey(bytes.subarray(offset, offset + 32));
}
function u64At(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);
}
export function decodeMarket(manifest, market, profile, mint) {
  if (
    !profile ||
    !profile.owner.equals(manifest.program) ||
    profile.data.length < 81 ||
    !sameBytes(profile.data, PROFILE_TAG)
  )
    fail('Artist profile does not match the configured program.');
  if (
    !keyAt(profile.data, 8).equals(market.authority) ||
    !keyAt(profile.data, 40).equals(market.mint) ||
    profile.data[80] !== market.bump
  )
    fail('Artist profile identity does not match the manifest.');
  const supply = u64At(profile.data, 72);
  if (supply > 100000n) fail('Market supply is outside the supported range.');
  if (
    !mint ||
    !mint.owner.equals(TOKEN_PROGRAM) ||
    mint.data.length !== 82 ||
    mint.data[44] !== 0 ||
    mint.data[45] !== 1
  )
    fail('Expected an initialized whole-token SPL mint.');
  const view = new DataView(mint.data.buffer, mint.data.byteOffset, mint.data.byteLength);
  if (
    view.getUint32(0, true) !== 1 ||
    !keyAt(mint.data, 4).equals(market.profile) ||
    view.getUint32(46, true) !== 1 ||
    !keyAt(mint.data, 50).equals(market.profile)
  )
    fail('Mint authority does not match the artist profile.');
  // Direct SPL burns can reduce actual mint supply without redeeming curve reserve.
  if (u64At(mint.data, 36) > supply) fail('Mint supply exceeds the curve’s issued supply.');
  return { supply, reserve: uint(profile.lamports, 'Reserve') };
}
export async function readMarket(connection, manifest, market) {
  const [profile, mint] = await connection.getMultipleAccountsInfo(
    [market.profile, market.mint],
    'confirmed',
  );
  return decodeMarket(manifest, market, profile, mint);
}
export function tokenAddress(wallet, market) {
  return PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), TOKEN_PROGRAM.toBuffer(), market.mint.toBuffer()],
    ASSOCIATED_PROGRAM,
  )[0];
}
export function decodeHolding(account, wallet, market) {
  if (!account) return 0n;
  if (
    !account.owner.equals(TOKEN_PROGRAM) ||
    account.data.length !== 165 ||
    !keyAt(account.data, 0).equals(market.mint) ||
    !keyAt(account.data, 32).equals(wallet) ||
    account.data[108] !== 1
  )
    fail('The wallet token account is invalid or frozen.');
  return u64At(account.data, 64);
}
export function curveQuote(supply, amount, side) {
  const s = uint(supply, 'Supply');
  const q = uint(amount, 'Quantity');
  if (s > 100000n || q < 1n || q > 10000n || !['buy', 'sell'].includes(side))
    fail('Choose 1–10,000 whole tokens and a valid trade side.');
  if (side === 'buy' && s + q > 100000n) fail('This buy would exceed the market supply cap.');
  if (side === 'sell' && q > s) fail('This sale exceeds the curve supply.');
  const gross =
    (1_000_000n * (side === 'buy' ? (s + q) ** 2n - s ** 2n : s ** 2n - (s - q) ** 2n)) / 2n;
  const fee = (gross * 5n) / 100n;
  return { quantity: q, gross, fee, total: side === 'buy' ? gross + fee : gross - fee };
}
export function encodeTrade(side, amount, limit, expiresAt) {
  if (!['buy', 'sell'].includes(side)) fail('Invalid trade side.');
  const data = Buffer.alloc(32);
  data.set(side === 'buy' ? BUY_TAG : SELL_TAG);
  data.writeBigUInt64LE(uint(amount), 8);
  data.writeBigUInt64LE(uint(limit), 16);
  const expiry = uint(expiresAt, 'Expiry');
  if (expiry > (1n << 63n) - 1n) fail('Expiry exceeds the signed timestamp range.');
  data.writeBigInt64LE(expiry, 24);
  return data;
}
export function tradeInstruction(manifest, market, wallet, side, quote, expiresAt) {
  const writable = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
  const readonly = (pubkey) => ({ pubkey, isSigner: false, isWritable: false });
  return new TransactionInstruction({
    programId: manifest.program,
    keys: [
      writable(wallet, true),
      writable(market.profile),
      writable(market.mint),
      writable(tokenAddress(wallet, market)),
      writable(manifest.fee),
      readonly(SystemProgram.programId),
      readonly(TOKEN_PROGRAM),
      ...(side === 'buy' ? [readonly(ASSOCIATED_PROGRAM)] : []),
    ],
    data: encodeTrade(side, quote.quantity, quote.total, expiresAt),
  });
}
export async function prepareTrade(connection, manifest, market, wallet, side, amount) {
  await verifyNetwork(connection, manifest);
  const [profile, mint, holding, walletInfo] = await connection.getMultipleAccountsInfo(
    [market.profile, market.mint, tokenAddress(wallet, market), wallet],
    'confirmed',
  );
  const state = decodeMarket(manifest, market, profile, mint);
  const held = decodeHolding(holding, wallet, market);
  const quote = curveQuote(state.supply, amount, side);
  if (side === 'sell' && held < quote.quantity) fail('Your wallet does not hold enough tokens.');
  const slot = await connection.getSlot('confirmed');
  const chainTime = await connection.getBlockTime(slot);
  if (!Number.isSafeInteger(chainTime) || Math.abs(Date.now() / 1000 - chainTime) > 20)
    fail('The chain clock is stale or this device clock differs. Refresh before trading.');
  const expiresAt = chainTime + 30;
  const recent = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({ feePayer: wallet, recentBlockhash: recent.blockhash }).add(
    tradeInstruction(manifest, market, wallet, side, quote, expiresAt),
  );
  const feeResult = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
  if (feeResult.value === null) fail('Unable to estimate the network fee. Refresh the quote.');
  const networkFee = uint(feeResult.value, 'Network fee');
  const accountRent =
    side === 'buy' && !holding
      ? uint(await connection.getMinimumBalanceForRentExemption(165), 'Token account rent')
      : 0n;
  const available = uint(walletInfo?.lamports || 0, 'Wallet balance');
  if (available < networkFee + accountRent + (side === 'buy' ? quote.total : 0n))
    fail('Not enough devnet SOL for this trade, network fee, and token account rent.');
  const simulation = await connection.simulateTransaction(
    new VersionedTransaction(transaction.compileMessage()),
    { sigVerify: false, commitment: 'confirmed' },
  );
  if (simulation.value.err)
    fail('The trade simulation failed. Refresh the quote and check your devnet balance.');
  return {
    ...quote,
    side,
    wallet: wallet.toBase58(),
    market: market.symbol,
    transaction,
    expiresAt,
    lastValidBlockHeight: recent.lastValidBlockHeight,
    networkFee,
    accountRent,
    available,
    held,
  };
}
export const explorer = (signature) =>
  `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
export const pendingKey = (manifest, wallet) =>
  `mtl.devnet.pending.v1:${manifest.program_id}:${wallet}`;
export function readPending(storage, manifest, wallet) {
  const raw = storage.getItem(pendingKey(manifest, wallet));
  if (raw === null) return null;
  let item;
  try {
    item = JSON.parse(raw);
  } catch {
    fail(
      'Saved transaction data is unreadable. Do not submit another trade until it is reconciled.',
    );
  }
  if (
    !item ||
    item.version !== 1 ||
    item.genesis !== DEVNET_GENESIS ||
    item.program !== manifest.program_id ||
    item.wallet !== wallet ||
    !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(item.signature) ||
    !Number.isSafeInteger(item.lastValidBlockHeight) ||
    item.lastValidBlockHeight < 0 ||
    !['buy', 'sell'].includes(item.side) ||
    !manifest.markets.some((market) => market.token_mint === item.mint)
  )
    fail('Saved transaction identity does not match this devnet wallet and deployment.');
  uint(item.quantity);
  uint(item.total);
  return item;
}
export function savePending(storage, manifest, wallet, item) {
  storage.setItem(pendingKey(manifest, wallet), JSON.stringify(item));
  if (readPending(storage, manifest, wallet)?.signature !== item.signature)
    fail('Could not persist the pending transaction. Nothing was submitted.');
}
// Caller must hold the same Web Lock used by submitTrade, so another tab cannot replace the record between read and remove.
export function clearPending(storage, manifest, wallet, signature) {
  if (readPending(storage, manifest, wallet)?.signature === signature)
    storage.removeItem(pendingKey(manifest, wallet));
}
export async function submitTrade({
  connection,
  manifest,
  market,
  wallet,
  signTransaction,
  quote,
  storage,
  onPending,
}) {
  if (readPending(storage, manifest, wallet.toBase58()))
    fail('Resolve the saved transaction before placing another trade.');
  if (
    quote.wallet !== wallet.toBase58() ||
    quote.market !== market.symbol ||
    quote.expiresAt <= Date.now() / 1000
  )
    fail('Wallet changed or quote expired. Get a fresh quote.');
  await verifyNetwork(connection, manifest);
  if (!quote.transaction.feePayer?.equals(wallet)) fail('Unexpected transaction fee payer.');
  const canonical = new Transaction({
    feePayer: wallet,
    recentBlockhash: quote.transaction.recentBlockhash,
  }).add(tradeInstruction(manifest, market, wallet, quote.side, quote, quote.expiresAt));
  const expected = Buffer.from(canonical.serializeMessage());
  if (!Buffer.from(quote.transaction.serializeMessage()).equals(expected))
    fail('The prepared transaction contains unexpected instructions.');
  const signed = await signTransaction(quote.transaction);
  if (!Buffer.from(signed.serializeMessage()).equals(expected))
    fail('The wallet changed the transaction. Nothing was submitted.');
  if (quote.expiresAt <= Date.now() / 1000)
    fail('The quote expired while awaiting your wallet. Nothing was submitted.');
  const bytes = signed.serialize(); // Requires and verifies every signature.
  if (!signed.signature) fail('The wallet did not sign the transaction.');
  const signature = base58(signed.signature);
  const item = {
    version: 1,
    genesis: DEVNET_GENESIS,
    program: manifest.program_id,
    wallet: wallet.toBase58(),
    mint: market.token_mint,
    symbol: market.symbol,
    side: quote.side,
    quantity: quote.quantity.toString(),
    total: quote.total.toString(),
    signature,
    lastValidBlockHeight: quote.lastValidBlockHeight,
    createdAt: Date.now(),
  };
  savePending(storage, manifest, wallet.toBase58(), item);
  onPending(item); // Durable intent exists before any network submission.
  try {
    const returned = await connection.sendRawTransaction(bytes, {
      skipPreflight: false,
      maxRetries: 0,
      preflightCommitment: 'confirmed',
    });
    if (returned !== signature)
      fail('RPC signature mismatch. Check the saved transaction; do not resubmit.');
  } catch {
    // RPC errors can occur after forwarding. Keep the signature and reconcile it.
    return { item, status: 'unknown' };
  }
  return { item, status: 'submitted' };
}
export async function reconcile(connection, manifest, item) {
  await verifyNetwork(connection, manifest);
  const response = await connection.getSignatureStatuses([item.signature], {
    searchTransactionHistory: true,
  });
  const status = response.value[0];
  if (status?.confirmationStatus === 'finalized')
    return { state: status.err ? 'failed' : 'finalized' };
  if (status) return { state: status.err ? 'failure-pending' : 'confirming' };
  if ((await connection.getBlockHeight('finalized')) > item.lastValidBlockHeight) {
    const transaction = await connection.getTransaction(item.signature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    });
    if (transaction) {
      if (!transaction.meta) fail('The RPC returned incomplete transaction metadata.');
      return { state: transaction.meta.err ? 'failed' : 'finalized' };
    }
    // Null history can mean RPC retention or indexing lag, not proof of no execution.
    return { state: 'expired-unresolved' };
  }
  return { state: 'pending' };
}
