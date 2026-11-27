// Adversarial local-validator checks. The operator pays network fees so rejected
// transactions can be checked for exact trader/reserve/mint state preservation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { prepare } from './src/engine.js';

const { BN, EventParser, utils } = anchor.BN ? anchor : anchor.default;
const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runSecurityScenario(s) {
    const artist = Keypair.generate();
    const otherArtist = Keypair.generate();
    const alice = Keypair.generate();
    const bob = Keypair.generate();
    const charlie = Keypair.generate();
    await prepare(s);
    for (const kp of [artist, otherArtist, alice, bob, charlie]) await s.fund(kp.publicKey, 1000);
    for (const kp of [artist, otherArtist]) assert.equal((await s.register(kp)).ok, true);
    const market = s.pdas(artist.publicKey);
    const otherMarket = s.pdas(otherArtist.publicKey);
    const ata = (owner, mint = market.mint) => utils.token.associatedAddress({ mint, owner });
    const accounts = [
        market.profile, market.mint, otherMarket.profile, otherMarket.mint, s.platform,
        alice.publicKey, bob.publicKey, charlie.publicKey,
        ata(alice.publicKey), ata(bob.publicKey), ata(charlie.publicKey),
        ata(alice.publicKey, otherMarket.mint),
    ];
    async function snapshot() {
        const rows = await s.connection.getMultipleAccountsInfo(accounts, 'confirmed');
        return rows.map((row) => row && ({ lamports: row.lamports, owner: row.owner.toBase58(), data: row.data.toString('base64') }));
    }
    const checks = {};
    const instructionNames = s.program.idl.instructions.map((ix) => ix.name.replaceAll('_', '').toLowerCase());
    assert.ok(instructionNames.includes('buytokenbounded') && instructionNames.includes('selltokenbounded'));
    assert.ok(!instructionNames.includes('buytoken') && !instructionNames.includes('selltoken'));
    checks.noLegacyInstructionExports = true;
    async function reject(name, run, expectedError) {
        const before = await snapshot();
        const result = await run();
        assert.equal(result.ok, false, `${name}: unexpectedly succeeded`);
        if (expectedError) assert.equal(result.error, expectedError, `${name}: unexpected failure reason`);
        assert.deepEqual(await snapshot(), before, `${name}: changed balances or accounts`);
        checks[name] = true;
    }
    const buy = await s.buy(alice, artist.publicKey, 10);
    assert.equal(buy.ok, true);
    assert.equal((await s.buy(bob, artist.publicKey, 5)).ok, true);
    assert.equal((await s.buy(alice, otherArtist.publicKey, 1)).ok, true);

    const staleBuy = await s.quote('buy', artist.publicKey, 1);
    assert.equal((await s.buy(bob, artist.publicKey, 1)).ok, true);
    await reject('staleBuyLimit', () => s.buy(alice, artist.publicKey, 1, { quote: staleBuy }), 'PriceLimitExceeded');
    const staleSell = await s.quote('sell', artist.publicKey, 1);
    assert.equal((await s.sell(bob, artist.publicKey, 1)).ok, true);
    await reject('staleSellLimit', () => s.sell(alice, artist.publicKey, 1, { quote: staleSell }), 'PriceLimitExceeded');

    for (const side of ['buy', 'sell']) {
        const fresh = await s.quote(side, artist.publicKey, 1);
        await reject(`${side}FeeInclusiveLimit`, () => s[side](alice, artist.publicKey, 1, {
            quote: { ...fresh, totalLamports: fresh.grossLamports },
        }), 'PriceLimitExceeded');
        await reject(`${side}Expired`, () => s[side](alice, artist.publicKey, 1, {
            quote: { ...fresh, expiresAt: 0 },
        }), 'QuoteExpired');
        await reject(`${side}ExpiryTooFar`, () => s[side](alice, artist.publicKey, 1, {
            quote: { ...fresh, expiresAt: fresh.expiresAt + 3600 },
        }), 'InvalidExpiry');
        await reject(`${side}ZeroQuantity`, () => s[side](alice, artist.publicKey, 0, { quote: fresh }), 'InvalidQuantity');
        await reject(`${side}OversizedQuantity`, () => s[side](alice, artist.publicKey, 10001, { quote: fresh }), 'InvalidQuantity');
    }
    // These deliberately wrong account overrides must fail in the program even
    // when a client or caller bypasses all frontend validation.
    await reject('wrongFeeRecipient', () => s.buy(alice, artist.publicKey, 1, {
        accounts: { platformWallet: bob.publicKey },
    }), 'ConstraintAddress');
    await reject('wrongMarketMint', () => s.buy(alice, artist.publicKey, 1, {
        accounts: { tokenMint: otherMarket.mint, userTokenAccount: ata(alice.publicKey, otherMarket.mint) },
    }), 'ConstraintAddress');
    await reject('wrongTokenOwner', () => s.sell(alice, artist.publicKey, 1, {
        accounts: { userTokenAccount: ata(bob.publicKey) },
    }), 'ConstraintTokenOwner');
    await reject('wrongTokenMint', () => s.sell(alice, artist.publicKey, 1, {
        accounts: { userTokenAccount: ata(alice.publicKey, otherMarket.mint) },
    }), 'ConstraintTokenMint');
    const approveData = Buffer.alloc(9); approveData[0] = 4; approveData.writeBigUInt64LE(1n, 1);
    const approve = new TransactionInstruction({ programId: tokenProgram, data: approveData, keys: [
        { pubkey: ata(alice.publicKey), isSigner: false, isWritable: true },
        { pubkey: bob.publicKey, isSigner: false, isWritable: false },
        { pubkey: alice.publicKey, isSigner: true, isWritable: false },
    ] });
    await s.program.provider.sendAndConfirm(new Transaction().add(approve), [alice]);
    await reject('delegatesCannotRedeemOwnerTokens', () => s.sell(bob, artist.publicKey, 1, {
        accounts: { userTokenAccount: ata(alice.publicKey) },
    }), 'ConstraintTokenOwner');
    await reject('insufficientHoldings', async () => s.sell(alice, artist.publicKey, 11, {
        quote: { totalLamports: '0', expiresAt: await s.chainTime() + 30 },
    }));

    // A legacy client must fail closed rather than reach an unbounded handler.
    for (const side of ['buy', 'sell']) {
        const quote = await s.quote(side, artist.publicKey, 1);
        const method = side === 'buy' ? s.program.methods.buyTokenBounded : s.program.methods.sellTokenBounded;
        const instruction = await method(new BN(1), new BN(quote.totalLamports), new BN(quote.expiresAt))
            .accountsPartial({ [side === 'buy' ? 'buyer' : 'seller']: alice.publicKey,
                artistProfile: market.profile, tokenMint: market.mint,
                userTokenAccount: ata(alice.publicKey), platformWallet: s.platform }).instruction();
        const legacyData = Buffer.alloc(16);
        createHash('sha256').update(`global:${side}_token`).digest().copy(legacyData, 0, 0, 8);
        legacyData.writeBigUInt64LE(1n, 8);
        instruction.data = legacyData;
        const beforeLegacy = await snapshot();
        await assert.rejects(s.program.provider.sendAndConfirm(new Transaction().add(instruction), [alice]),
            /InstructionFallbackNotFound|custom program error: 0x65/);
        assert.deepEqual(await snapshot(), beforeLegacy);
        checks[`${side}LegacyInstructionRejected`] = true;
    }

    // Force an actually submitted transaction to fail AFTER a valid buy. This
    // exercises runtime rollback of reserve, fee, mint, counter and ATA creation;
    // checking only a rejected preflight simulation would not prove this path.
    const before = await snapshot();
    const quote = await s.quote('buy', artist.publicKey, 1);
    const instruction = await s.program.methods.buyTokenBounded(new BN(1), new BN(quote.totalLamports), new BN(quote.expiresAt))
        .accountsPartial({ buyer: charlie.publicKey, artistProfile: market.profile, tokenMint: market.mint,
            userTokenAccount: ata(charlie.publicKey), platformWallet: s.platform }).instruction();
    const block = await s.connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: s.operator.publicKey, ...block }).add(instruction,
        SystemProgram.transfer({ fromPubkey: charlie.publicKey, toPubkey: bob.publicKey,
            lamports: await s.connection.getBalance(charlie.publicKey) + 1 }));
    tx.sign(s.operator, charlie);
    const signature = await s.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    const confirmation = await s.connection.confirmTransaction({ signature, ...block }, 'confirmed');
    assert.notEqual(confirmation.value.err, null, 'injected failure unexpectedly succeeded');
    assert.deepEqual(await snapshot(), before, 'failed transaction did not roll back its successful buy instruction');
    checks.atomicRollbackAfterBuy = true;

    // Public SPL burns intentionally do NOT release reserve or lower the curve
    // counter. Treat them as donations; preserve the existing redemption policy.
    const beforeBurn = await s.state(otherArtist.publicKey);
    const burnData = Buffer.alloc(9); burnData[0] = 8; burnData.writeBigUInt64LE(1n, 1);
    const burn = new TransactionInstruction({ programId: tokenProgram, data: burnData, keys: [
        { pubkey: ata(alice.publicKey, otherMarket.mint), isSigner: false, isWritable: true },
        { pubkey: otherMarket.mint, isSigner: false, isWritable: true },
        { pubkey: alice.publicKey, isSigner: true, isWritable: false },
    ] });
    await s.program.provider.sendAndConfirm(new Transaction().add(burn), [alice]);
    assert.equal((await s.connection.getTokenSupply(otherMarket.mint)).value.amount, '0');
    const afterBurn = await s.state(otherArtist.publicKey);
    assert.equal(afterBurn.supply, beforeBurn.supply);
    assert.equal(afterBurn.reserveExcess, beforeBurn.reserveExcess);
    assert.equal((await s.quote('buy', otherArtist.publicKey, 1)).grossLamports, '1500000');
    checks.externalBurnPreservesCurvePolicy = true;

    let receipt;
    for (let attempt = 0; attempt < 20 && !receipt; attempt++) {
        receipt = await s.connection.getTransaction(buy.sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!receipt) await pause(100);
    }
    assert.ok(receipt, 'confirmed buy receipt is missing');
    const events = [...new EventParser(s.program.programId, s.program.coder).parseLogs(receipt.meta.logMessages)];
    const trade = events.find((event) => event.name.replaceAll('_', '').toLowerCase() === 'tradeexecuted');
    assert.ok(trade, 'structured trade event missing');
    assert.equal(trade.data.trader.toBase58(), alice.publicKey.toBase58());
    assert.equal(trade.data.isBuy, true);
    assert.equal(trade.data.amount.toString(), '10');
    assert.equal(trade.data.totalLamports.toString(), '52500000');
    checks.structuredTradeEvent = true;
    return { pass: Object.values(checks).every(Boolean), checks };
}
