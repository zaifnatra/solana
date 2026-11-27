import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { fixture, memoryStorage } from './devnet-fixtures.mjs';
import { DEVNET_GENESIS, validateManifest, curveQuote, encodeTrade, decodeMarket, decodeHolding, sol, uint, verifyNetwork, prepareTrade, tradeInstruction, submitTrade, readPending, savePending, clearPending, reconcile, pendingKey, base58, tokenAddress } from '../src/devnet/client.js';

test('manifest binds devnet, bounded ABI, and derived artist/profile/mint identities',()=>{
  const {raw}=fixture();
  for(const mutate of [v=>v.cluster='mainnet-beta',v=>v.abi_version=1,v=>v.genesis_hash='wrong',v=>v.markets[0].artist_profile=v.program_id,v=>v.markets[0].token_mint=v.program_id,v=>v.markets.push(v.markets[0])]) {
    const value=structuredClone(raw);mutate(value);assert.throws(()=>validateManifest(value));
  }
  assert.equal(validateManifest({...raw,markets:[]}).markets.length,0);
});
test('curve limits and fee amounts use exact BigInt arithmetic',()=>{
  assert.deepEqual(curveQuote(0n,10n,'buy'),{quantity:10n,gross:50000000n,fee:2500000n,total:52500000n});
  assert.equal(curveQuote(10n,10n,'sell').total,47500000n);
  for(const args of [[0,0,'buy'],[0,10001,'buy'],[99999,2,'buy'],[1,2,'sell'],[0,1,'x']]) assert.throws(()=>curveQuote(...args));
  assert.throws(()=>uint(Number.MAX_SAFE_INTEGER+1));assert.throws(()=>uint('-1'));
  assert.equal(sol(9007199254740993n),'9007199.254740993');
});
test('ABI is Anchor discriminator plus three little-endian eight-byte arguments',()=>{
  for(const side of ['buy','sell']) {
    const data=encodeTrade(side,10n,52500000n,1700000000);
    assert.equal(data.length,32);assert.deepEqual(data.subarray(0,8),createHash('sha256').update(`global:${side}_token_bounded`).digest().subarray(0,8));
    assert.equal(data.readBigUInt64LE(8),10n);assert.equal(data.readBigUInt64LE(16),52500000n);assert.equal(data.readBigInt64LE(24),1700000000n);
  }
  assert.throws(()=>encodeTrade('buy',1n,1n,1n<<63n));
});
test('chain account decoders reject wrong owner, mint authority, discriminator and frozen holdings',()=>{
  const f=fixture();assert.equal(decodeMarket(f.manifest,f.market,f.profileInfo,f.mintInfo).supply,10n);
  assert.equal(decodeHolding(f.holdingInfo,f.wallet.publicKey,f.market),10n);
  const broken=()=>({...f.profileInfo,data:Buffer.from(f.profileInfo.data)});
  let p=broken();p.data[0]^=1;assert.throws(()=>decodeMarket(f.manifest,f.market,p,f.mintInfo));
  p=broken();p.owner=SystemProgram.programId;assert.throws(()=>decodeMarket(f.manifest,f.market,p,f.mintInfo));
  const m={...f.mintInfo,data:Buffer.from(f.mintInfo.data)};m.data[44]=9;assert.throws(()=>decodeMarket(f.manifest,f.market,f.profileInfo,m));
  f.holdingInfo.data[108]=2;assert.throws(()=>decodeHolding(f.holdingInfo,f.wallet.publicKey,f.market));
});
test('network verification rejects mainnet and non-executable programs before signing',async()=>{
  const f=fixture();f.connection.getGenesisHash=async()=>'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
  await assert.rejects(verifyNetwork(f.connection,f.manifest),/restricted to devnet/);
  f.connection.getGenesisHash=async()=>DEVNET_GENESIS;f.programInfo.executable=false;
  await assert.rejects(verifyNetwork(f.connection,f.manifest),/not deployed/);
});
test('quote includes rent/network fee, simulates, and builds exact buy/sell account order',async()=>{
  const f=fixture();
  f.accounts.delete(tokenAddress(f.wallet.publicKey,f.market).toBase58());
  const q=await prepareTrade(f.connection,f.manifest,f.market,f.wallet.publicKey,'buy','1');
  assert.equal(q.accountRent,2039280n);assert.equal(q.networkFee,5000n);
  const buy=tradeInstruction(f.manifest,f.market,f.wallet.publicKey,'buy',q,q.expiresAt);
  const sell=tradeInstruction(f.manifest,f.market,f.wallet.publicKey,'sell',q,q.expiresAt);
  assert.equal(buy.keys.length,8);assert.equal(sell.keys.length,7);
  assert(buy.keys[0].isSigner&&buy.keys[0].pubkey.equals(f.wallet.publicKey));assert(buy.keys[4].pubkey.equals(f.manifest.fee));
  f.walletInfo.lamports=1;await assert.rejects(prepareTrade(f.connection,f.manifest,f.market,f.wallet.publicKey,'buy','1'),/Not enough/);
  f.walletInfo.lamports=1000000000;f.connection.simulateTransaction=async()=>({value:{err:'failure'}});
  await assert.rejects(prepareTrade(f.connection,f.manifest,f.market,f.wallet.publicKey,'buy','1'),/simulation failed/);
});
async function submission() {
  const f=fixture();const quote=await prepareTrade(f.connection,f.manifest,f.market,f.wallet.publicKey,'buy','1');
  const storage=memoryStorage();let persisted=null;
  const args={connection:f.connection,manifest:f.manifest,market:f.market,wallet:f.wallet.publicKey,quote,storage,onPending:item=>persisted=item,signTransaction:async(tx)=>{tx.partialSign(f.wallet);return tx;}};
  return {f,args,storage,persisted:()=>persisted};
}
test('signature persists before broadcast; unknown send outcome blocks economic retries',async()=>{
  const {f,args,storage,persisted}=await submission();let sends=0;
  f.connection.sendRawTransaction=async()=>{sends++;assert(persisted());assert(readPending(storage,f.manifest,f.wallet.publicKey.toBase58()));throw new Error('network disconnected');};
  const result=await submitTrade(args);assert.equal(result.status,'unknown');assert.equal(sends,1);
  await assert.rejects(submitTrade(args),/Resolve the saved/);assert.equal(sends,1);
  const restored=readPending(storage,f.manifest,f.wallet.publicKey.toBase58());assert.equal(restored.signature,result.item.signature);
});
test('RPC returning the wrong signature remains unresolved with locally derived signature',async()=>{
  const {f,args}=await submission();f.connection.sendRawTransaction=async()=>base58(new Uint8Array(64).fill(9));
  const result=await submitTrade(args);assert.equal(result.status,'unknown');assert.equal(result.item.signature,base58(args.quote.transaction.signature));
});
test('wallet mutation, unexpected instruction, wrong payer and storage failure cannot broadcast',async()=>{
  for(const scenario of ['wallet','instruction','payer','storage','rejection']) {
    const {f,args}=await submission();let sends=0;f.connection.sendRawTransaction=async()=>{sends++;};
    if(scenario==='wallet') args.signTransaction=async(tx)=>{tx.recentBlockhash=new PublicKey(new Uint8Array(32).fill(9)).toBase58();tx.partialSign(f.wallet);return tx;};
    if(scenario==='instruction') args.quote.transaction.add(SystemProgram.transfer({fromPubkey:f.wallet.publicKey,toPubkey:f.manifest.fee,lamports:1}));
    if(scenario==='payer') args.quote.transaction.feePayer=f.manifest.fee;
    if(scenario==='storage') args.storage.setItem=()=>{throw new Error('Storage denied');};
    if(scenario==='rejection') args.signTransaction=async()=>{throw new Error('User rejected');};
    await assert.rejects(submitTrade(args));assert.equal(sends,0,scenario);
  }
});
test('recovery finalizes explicit chain outcomes and preserves missing-history uncertainty after expiry',async()=>{
  const {f,args}=await submission();f.connection.sendRawTransaction=async()=>base58(args.quote.transaction.signature);
  const {item}=await submitTrade(args);
  assert.equal((await reconcile(f.connection,f.manifest,item)).state,'pending');
  f.connection.getBlockHeight=async()=>151;
  assert.equal((await reconcile(f.connection,f.manifest,item)).state,'expired-unresolved');
  assert(readPending(args.storage,f.manifest,f.wallet.publicKey.toBase58()));
  f.connection.getSignatureStatuses=async()=>({value:[{confirmationStatus:'confirmed',err:null}]});assert.equal((await reconcile(f.connection,f.manifest,item)).state,'confirming');
  f.connection.getSignatureStatuses=async()=>({value:[{confirmationStatus:'finalized',err:null}]});assert.equal((await reconcile(f.connection,f.manifest,item)).state,'finalized');
  f.connection.getSignatureStatuses=async()=>({value:[{confirmationStatus:'finalized',err:{InstructionError:[0,'Custom']}}]});assert.equal((await reconcile(f.connection,f.manifest,item)).state,'failed');
  f.connection.getSignatureStatuses=async()=>{throw new Error('RPC down');};await assert.rejects(reconcile(f.connection,f.manifest,item));assert(readPending(args.storage,f.manifest,f.wallet.publicKey.toBase58()));
});
test('saved pending record rejects wrong network, mint, and malformed durable data',async()=>{
  const {f,args}=await submission();f.connection.sendRawTransaction=async()=>base58(args.quote.transaction.signature);
  const {item}=await submitTrade(args);const key=pendingKey(f.manifest,f.wallet.publicKey.toBase58());
  for(const change of [{genesis:'wrong'},{mint:f.manifest.program_id},{signature:'nope'}]) {
    args.storage.setItem(key,JSON.stringify({...item,...change}));assert.throws(()=>readPending(args.storage,f.manifest,f.wallet.publicKey.toBase58()));
  }
  args.storage.setItem(key,'broken');assert.throws(()=>readPending(args.storage,f.manifest,f.wallet.publicKey.toBase58()));
  savePending(args.storage,f.manifest,f.wallet.publicKey.toBase58(),item);assert.equal(readPending(args.storage,f.manifest,f.wallet.publicKey.toBase58()).signature,item.signature);
});

test('an older result cannot clear a newer durable transaction for the same wallet',async()=>{
  const {f,args}=await submission();f.connection.sendRawTransaction=async()=>base58(args.quote.transaction.signature);
  const {item}=await submitTrade(args);
  const next={...item,signature:base58(new Uint8Array(64).fill(7))};
  savePending(args.storage,f.manifest,item.wallet,next);
  clearPending(args.storage,f.manifest,item.wallet,item.signature);
  assert.equal(readPending(args.storage,f.manifest,item.wallet).signature,next.signature);
});

test('a quote expiring during wallet approval is neither persisted nor submitted', async (t) => {
  const { f, args, persisted } = await submission();
  let broadcasts = 0;
  f.connection.sendRawTransaction = async () => { broadcasts += 1; };
  args.signTransaction = async (transaction) => {
    transaction.partialSign(f.wallet);
    t.mock.method(Date, 'now', () => args.quote.expiresAt * 1000);
    return transaction;
  };
  await assert.rejects(submitTrade(args), /expired while awaiting your wallet/);
  assert.equal(broadcasts, 0);
  assert.equal(persisted(), null);
  assert.equal(readPending(args.storage, f.manifest, f.wallet.publicKey.toBase58()), null);
});
