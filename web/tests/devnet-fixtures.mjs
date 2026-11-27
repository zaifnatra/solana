// Test-only deterministic identities. Never deploy or fund these fixture addresses.
import { Buffer } from 'node:buffer';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { DEVNET_GENESIS, TOKEN_PROGRAM, UPGRADEABLE_LOADER, validateManifest, tokenAddress } from '../src/devnet/client.js';

export function fixture() {
  const program = new PublicKey(new Uint8Array(32).fill(3));
  const authority = new PublicKey(new Uint8Array(32).fill(4));
  const fee = new PublicKey(new Uint8Array(32).fill(5));
  const [profile,bump] = PublicKey.findProgramAddressSync([Buffer.from('artist'),authority.toBuffer()],program);
  const [mint] = PublicKey.findProgramAddressSync([Buffer.from('mint'),authority.toBuffer()],program);
  const wallet = Keypair.fromSeed(new Uint8Array(32).fill(6));
  const raw = { version:1, abi_version:2, cluster:'devnet', genesis_hash:DEVNET_GENESIS, program_id:program.toBase58(), platform_wallet:fee.toBase58(), markets:[{symbol:'TEST',name:'Fixture artist',artist_authority:authority.toBase58(),artist_profile:profile.toBase58(),token_mint:mint.toBase58()}] };
  const manifest = validateManifest(raw); const market = manifest.markets[0];
  const profileData = Buffer.alloc(82);
  profileData.set([165,86,81,235,237,135,127,170]); profileData.set(authority.toBuffer(),8); profileData.set(mint.toBuffer(),40); profileData.writeBigUInt64LE(10n,72); profileData[80]=bump;
  const mintData = Buffer.alloc(82);
  mintData.writeUInt32LE(1,0);mintData.set(profile.toBuffer(),4);mintData.writeBigUInt64LE(10n,36);mintData[44]=0;mintData[45]=1;mintData.writeUInt32LE(1,46);mintData.set(profile.toBuffer(),50);
  const holdingData = Buffer.alloc(165);holdingData.set(mint.toBuffer());holdingData.set(wallet.publicKey.toBuffer(),32);holdingData.writeBigUInt64LE(10n,64);holdingData[108]=1;
  const profileInfo={ owner:program, data:profileData, lamports:51_000_000, executable:false };
  const mintInfo={ owner:TOKEN_PROGRAM, data:mintData, lamports:1_000_000, executable:false };
  const holdingInfo={ owner:TOKEN_PROGRAM, data:holdingData, lamports:2_039_280, executable:false };
  const programInfo={owner:UPGRADEABLE_LOADER,data:Buffer.alloc(36),lamports:1,executable:true};
  const walletInfo={owner:SystemProgram.programId,data:Buffer.alloc(0),lamports:100_000_000_000,executable:false};
  const accounts = new Map([[program.toBase58(),programInfo],[profile.toBase58(),profileInfo],[mint.toBase58(),mintInfo],[wallet.publicKey.toBase58(),walletInfo],[tokenAddress(wallet.publicKey,market).toBase58(),holdingInfo]]);
  const connection={
    getGenesisHash:async()=>DEVNET_GENESIS,
    getAccountInfo:async(key)=>accounts.get(key.toBase58())||null,
    getMultipleAccountsInfo:async(keys)=>keys.map(key=>accounts.get(key.toBase58())||null),
    getSlot:async()=>100,
    getBlockTime:async()=>Math.floor(Date.now()/1000),
    getLatestBlockhash:async()=>({blockhash:new PublicKey(new Uint8Array(32).fill(8)).toBase58(),lastValidBlockHeight:150}),
    getFeeForMessage:async()=>({context:{slot:100},value:5000}),
    getMinimumBalanceForRentExemption:async()=>2_039_280,
    simulateTransaction:async()=>({context:{slot:100},value:{err:null}}),
    getSignatureStatuses:async()=>({value:[null]}),
    getBlockHeight:async()=>100,
    getTransaction:async()=>null,
  };
  return { raw,manifest,market,wallet,profileInfo,mintInfo,holdingInfo,programInfo,walletInfo,accounts,connection };
}
export function memoryStorage() {
  const items = new Map();
  return { getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key),items };
}
// Browser visual QA can intercept a fake RPC endpoint and respond with this handler.
export async function rpcResponse(method, params=[], state=fixture()) {
  const accountJson=(info)=>info?{...info,owner:info.owner.toBase58(),data:[info.data.toString('base64'),'base64'],rentEpoch:0}:null;
  const context={slot:100,apiVersion:'test'};
  switch(method) {
    case 'getGenesisHash':return DEVNET_GENESIS;
    case 'getAccountInfo':return {context,value:accountJson(state.accounts.get(params[0]))};
    case 'getMultipleAccounts':return {context,value:params[0].map(key=>accountJson(state.accounts.get(key)))};
    case 'getSlot':return 100;
    case 'getBlockTime':return Math.floor(Date.now()/1000);
    case 'getLatestBlockhash':return {context,value:await state.connection.getLatestBlockhash()};
    case 'getFeeForMessage':return {context,value:5000};
    case 'getMinimumBalanceForRentExemption':return 2_039_280;
    case 'simulateTransaction':return {context,value:{err:null,logs:[],accounts:null,unitsConsumed:10000,returnData:null}};
    case 'getSignatureStatuses':return {context,value:[null]};
    case 'getBlockHeight':return 100;
    case 'getTransaction':return null;
    default:throw new Error(`Unexpected fixture RPC ${method}`);
  }
}
