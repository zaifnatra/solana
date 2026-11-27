// Staging client for the on-chain engine. Runs in the browser (UI) and in Node (scenario CLI).
// It reads everything from the IDL that `anchor build` writes to engine/target/idl/.
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';

// Node 22 CJS interop misses some named exports (BN). Fall back to the default export.
const { BN, Program, AnchorProvider, utils } = anchor.BN ? anchor : anchor.default;

// Must match PLATFORM_WALLET in engine/programs/sol_proj/src/lib.rs.
// Used only if the IDL does not carry the fixed address.
const PLATFORM_WALLET = '7i4y4j4NwphNWJ92SGEEF1vToojQ9LLWGjccQawi56fm';

export const keypairWallet = (kp) => ({
    publicKey: kp.publicKey,
    async signTransaction(tx) {
        'version' in tx ? tx.sign([kp]) : tx.partialSign(kp);
        return tx;
    },
    async signAllTransactions(txs) {
        return Promise.all(txs.map((tx) => this.signTransaction(tx)));
    },
});

/**
 * The operator keypair pays all transaction fees. Buyers and artists sign only
 * for their own accounts, so reserve and fee deltas are clean curve numbers.
 */
export function createStaging({ idl, rpcUrl, operator = Keypair.generate() }) {
    const connection = new Connection(rpcUrl, 'confirmed');
    const provider = new AnchorProvider(connection, keypairWallet(operator), { commitment: 'confirmed' });
    const program = new Program(idl, provider);
    const buyIx = idl.instructions.find((ix) => ix.name === 'buy_token_bounded');
    const platform = new PublicKey(
        buyIx.accounts.find((a) => a.name === 'platform_wallet').address ?? PLATFORM_WALLET,
    );

    const pdas = (artist) => ({
        profile: PublicKey.findProgramAddressSync([Buffer.from('artist'), artist.toBuffer()], program.programId)[0],
        mint: PublicKey.findProgramAddressSync([Buffer.from('mint'), artist.toBuffer()], program.programId)[0],
    });

    async function fund(pubkey, sol) {
        const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
        await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) });
    }

    // Reads compute units and lamport deltas from the confirmed transaction.
    async function measure(action, amount, artist, run) {
        const { profile } = pdas(artist);
        let sig;
        try {
            sig = await run();
            let tx;
            for (let attempt = 0; attempt < 20 && !tx; attempt++) {
                tx = await connection.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
                if (!tx) await new Promise((resolve) => setTimeout(resolve, 100));
            }
            if (!tx) throw new Error('Confirmed transaction details unavailable; inspect the signature before retrying');
            if (tx.meta.err) throw new Error(`Transaction failed: ${JSON.stringify(tx.meta.err)}`);
            const keys = tx.transaction.message.staticAccountKeys ?? tx.transaction.message.accountKeys;
            const delta = (pk) => {
                const i = keys.findIndex((k) => k.equals(pk));
                return i < 0 ? 0 : tx.meta.postBalances[i] - tx.meta.preBalances[i];
            };
            return { ok: true, action, amount, sig, cu: tx.meta.computeUnitsConsumed, reserveDelta: delta(profile), feeDelta: delta(platform) };
        } catch (e) {
            return { ok: false, action, amount, ...(sig ? { sig } : {}), error: e.error?.errorCode?.code ?? e.message };
        }
    }

    const register = (artistKp) =>
        measure('register', 0, artistKp.publicKey, () => {
            const { profile, mint } = pdas(artistKp.publicKey);
            return program.methods.registerArtist()
                .accountsPartial({ authority: artistKp.publicKey, artistProfile: profile, tokenMint: mint })
                .signers([artistKp]).rpc();
        });

    async function chainTime() {
        const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
        if (!clock || clock.data.length < 40) throw new Error('Chain clock is unavailable');
        return Number(clock.data.readBigInt64LE(32));
    }

    async function quote(action, artist, amount) {
        if (action !== 'buy' && action !== 'sell') throw new Error('Unknown trade side');
        const { profile } = pdas(artist);
        const [account, timestamp] = await Promise.all([
            program.account.artistProfile.fetch(profile), chainTime(),
        ]);
        const supply = BigInt(account.tokenSupply.toString());
        const quantity = BigInt(amount);
        const next = action === 'buy' ? supply + quantity : supply - quantity;
        if (next < 0n) throw new Error('Insufficient curve supply');
        const gross = 1_000_000n * (action === 'buy' ? next * next - supply * supply : supply * supply - next * next) / 2n;
        const fee = gross * 500n / 10_000n;
        return {
            grossLamports: gross.toString(), feeLamports: fee.toString(),
            totalLamports: (action === 'buy' ? gross + fee : gross - fee).toString(),
            expiresAt: timestamp + 30,
        };
    }

    // Optional quote/account overrides are used by local-validator adversarial tests.
    // The program, not this preview, enforces price limits, expiry, and ownership.
    const trade = (action) => (userKp, artist, amount, options = {}) =>
        measure(action, amount, artist, async () => {
            const { profile, mint } = pdas(artist);
            const accounts = {
                artistProfile: profile,
                tokenMint: mint,
                userTokenAccount: utils.token.associatedAddress({ mint, owner: userKp.publicKey }),
                platformWallet: platform,
                ...options.accounts,
            };
            const limit = options.quote ?? await quote(action, artist, amount);
            const args = [new BN(String(amount)), new BN(limit.totalLamports), new BN(limit.expiresAt)];
            const method = action === 'buy'
                ? program.methods.buyTokenBounded(...args).accountsPartial({ buyer: userKp.publicKey, ...accounts })
                : program.methods.sellTokenBounded(...args).accountsPartial({ seller: userKp.publicKey, ...accounts });
            return method.signers([userKp]).rpc({ skipPreflight: options.skipPreflight ?? false });
        });

    async function holdings(artist, owner) {
        const ata = utils.token.associatedAddress({ mint: pdas(artist).mint, owner });
        const bal = await connection.getTokenAccountBalance(ata).catch(() => null);
        return bal ? Number(bal.value.amount) : 0;
    }

    // reserveExcess = lamports above the rent minimum. It must equal what selling
    // every outstanding token would refund, and be 0 when supply is 0.
    async function state(artist) {
        const { profile } = pdas(artist);
        const [account, info, platformLamports] = await Promise.all([
            program.account.artistProfile.fetchNullable(profile),
            connection.getAccountInfo(profile),
            connection.getBalance(platform),
        ]);
        if (!account) return null;
        const rentMin = await connection.getMinimumBalanceForRentExemption(info.data.length);
        return { supply: account.tokenSupply.toNumber(), reserveExcess: info.lamports - rentMin, platformLamports };
    }

    async function programDeployed() {
        const info = await connection.getAccountInfo(program.programId).catch(() => null);
        return Boolean(info?.executable);
    }

    return {
        connection, program, operator, platform, pdas, fund, register, programDeployed,
        buy: trade('buy'), sell: trade('sell'), quote, chainTime, holdings, state,
    };
}

/**
 * Funds the operator, and tops up the platform wallet to the rent minimum.
 * A system account below the rent minimum cannot receive the small fee transfers.
 */
export async function prepare(s) {
    await s.fund(s.operator.publicKey, 10);
    const [balance, rentMin] = await Promise.all([
        s.connection.getBalance(s.platform),
        s.connection.getMinimumBalanceForRentExemption(0),
    ]);
    if (balance < rentMin) await s.fund(s.platform, 1);
}

// Small seeded PRNG, so two runs with the same seed make the same trades.
function rng(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const stats = (rows) => {
    const cu = rows.filter((r) => r.ok).map((r) => r.cu);
    return { count: rows.length, failed: rows.filter((r) => !r.ok).length, cuAvg: cu.length ? Math.round(cu.reduce((a, b) => a + b, 0) / cu.length) : 0, cuMax: Math.max(0, ...cu) };
};

/**
 * Registers a new artist, makes `trades` random buys and sells, then every
 * buyer sells everything. Pass = no failed trade, supply 0, reserve back to rent minimum.
 */
export async function runScenario(s, { trades = 50, buyers = 3, maxAmount = 20, seed = 1, onStep = () => {} } = {}) {
    const rand = rng(seed);
    const artist = Keypair.generate();
    const users = Array.from({ length: buyers }, () => Keypair.generate());
    await prepare(s);
    for (const kp of [artist, ...users]) await s.fund(kp.publicKey, 1000);

    const log = [];
    const step = (row) => { log.push(row); onStep(row, log); };
    step(await s.register(artist));
    const held = users.map(() => 0);

    for (let i = 0; i < trades; i++) {
        const u = Math.floor(rand() * users.length);
        const sell = held[u] > 0 && rand() < 0.4;
        const amount = 1 + Math.floor(rand() * (sell ? held[u] : maxAmount));
        const row = await s[sell ? 'sell' : 'buy'](users[u], artist.publicKey, amount);
        if (row.ok) held[u] += sell ? -amount : amount;
        step(row);
    }
    for (const [u, kp] of users.entries()) {
        while (held[u] > 0) {
            const amount = Math.min(held[u], 10_000);
            const row = await s.sell(kp, artist.publicKey, amount);
            step(row);
            if (!row.ok) break;
            held[u] -= amount;
        }
    }

    const end = await s.state(artist.publicKey);
    const checks = {
        noFailedTrades: log.every((r) => r.ok),
        supplyIsZero: end?.supply === 0,
        reserveDrained: end?.reserveExcess === 0,
    };
    return {
        seed, trades, buyers, maxAmount,
        pass: Object.values(checks).every(Boolean),
        checks,
        register: stats(log.filter((r) => r.action === 'register')),
        buy: stats(log.filter((r) => r.action === 'buy')),
        sell: stats(log.filter((r) => r.action === 'sell')),
        feesCollected: log.reduce((sum, r) => sum + (r.feeDelta ?? 0), 0),
        errors: log.filter((r) => !r.ok).map((r) => `${r.action} ${r.amount}: ${r.error}`),
    };
}
