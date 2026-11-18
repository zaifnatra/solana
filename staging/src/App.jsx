import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import idl from '../../engine/target/idl/sol_proj.json';
import { createStaging, prepare, runScenario } from './engine';

const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8899';
const BUYERS = 3;

// Burner keys for localnet only. Stored so a reload keeps the same session.
const toKp = (arr) => Keypair.fromSecretKey(Uint8Array.from(arr));
const loadSession = () => {
    const raw = JSON.parse(localStorage.getItem('staging-session') ?? 'null');
    return raw && { operator: toKp(raw.operator), artist: toKp(raw.artist), buyers: raw.buyers.map(toKp) };
};
const saveSession = (s) =>
    localStorage.setItem('staging-session', JSON.stringify({
        operator: [...s.operator.secretKey], artist: [...s.artist.secretKey], buyers: s.buyers.map((b) => [...b.secretKey]),
    }));

const sol = (lamports) => (lamports / LAMPORTS_PER_SOL).toFixed(6);
const short = (pk) => `${pk.toBase58().slice(0, 4)}…${pk.toBase58().slice(-4)}`;

export default function App() {
    const [session, setSession] = useState(loadSession);
    const staging = useMemo(
        () => createStaging({ idl, rpcUrl: RPC_URL, operator: session?.operator }),
        [session],
    );
    const [deployed, setDeployed] = useState(null);
    const [view, setView] = useState(null); // { supply, reserveExcess, platformLamports, holdings[] }
    const [log, setLog] = useState([]);
    const [busy, setBusy] = useState('');
    const [buyer, setBuyer] = useState(0);
    const [amount, setAmount] = useState(10);
    const [scenario, setScenario] = useState({ trades: 50, seed: 1, maxAmount: 20 });
    const [runs, setRuns] = useState([]);

    const refresh = useCallback(async () => {
        setDeployed(await staging.programDeployed());
        if (!session) return setView(null);
        const st = await staging.state(session.artist.publicKey);
        if (!st) { // ledger was reset: the stored session no longer exists
            localStorage.removeItem('staging-session');
            return setSession(null);
        }
        const holdings = await Promise.all(session.buyers.map((b) => staging.holdings(session.artist.publicKey, b.publicKey)));
        setView({ ...st, holdings });
    }, [staging, session]);

    useEffect(() => { refresh().catch((e) => setBusy(`RPC error: ${e.message}`)); }, [refresh]);

    const act = (label, fn) => async () => {
        setBusy(label);
        try { await fn(); await refresh(); setBusy(''); } catch (e) { setBusy(`Error: ${e.message}`); }
    };

    const newSession = act('Creating session…', async () => {
        const next = { operator: Keypair.generate(), artist: Keypair.generate(), buyers: Array.from({ length: BUYERS }, () => Keypair.generate()) };
        const s = createStaging({ idl, rpcUrl: RPC_URL, operator: next.operator });
        await prepare(s);
        for (const kp of [next.artist, ...next.buyers]) await s.fund(kp.publicKey, 1000);
        const row = await s.register(next.artist);
        saveSession(next);
        setLog([row]);
        setSession(next);
    });

    const trade = (side) => act(`${side}…`, async () => {
        const row = await staging[side](session.buyers[buyer], session.artist.publicKey, Number(amount));
        setLog((l) => [{ ...row, who: `buyer ${buyer + 1}` }, ...l]);
    });

    const run = act('Running scenario…', async () => {
        const result = await runScenario(staging, {
            ...scenario,
            onStep: (row) => setBusy(`Running scenario… ${row.action} ${row.amount}`),
        });
        setRuns((r) => [result, ...r]);
    });

    return (
        <div className="page">
            <header className="top">
                <h1>Engine Staging</h1>
                <div className="meta">
                    <span>{RPC_URL}</span>
                    <span>program {short(staging.program.programId)}</span>
                    <span className={deployed ? 'ok' : 'bad'}>{deployed == null ? '…' : deployed ? 'deployed' : 'not deployed'}</span>
                </div>
            </header>

            {deployed === false && (
                <p className="card warn">Program not found. Start staging with <code>cd staging && npm run up</code>.</p>
            )}
            {busy && <p className="status">{busy}</p>}

            <div className="grid">
                <section className="card">
                    <h2>Session</h2>
                    {session ? (
                        <dl>
                            <dt>Artist</dt><dd>{short(session.artist.publicKey)}</dd>
                            <dt>Platform</dt><dd>{short(staging.platform)}</dd>
                            {session.buyers.map((b, i) => (<Fragment key={i}><dt>Buyer {i + 1}</dt><dd>{short(b.publicKey)}</dd></Fragment>))}
                        </dl>
                    ) : <p className="muted">No session yet.</p>}
                    <button onClick={newSession} disabled={!deployed || !!busy}>New session</button>
                </section>

                <section className="card">
                    <h2>State</h2>
                    {view ? (
                        <dl>
                            <dt>Supply</dt><dd>{view.supply}</dd>
                            <dt>Reserve (above rent)</dt><dd>{sol(view.reserveExcess)} SOL</dd>
                            <dt>Platform balance</dt><dd>{sol(view.platformLamports)} SOL</dd>
                            {view.holdings.map((h, i) => (<Fragment key={i}><dt>Buyer {i + 1} holds</dt><dd>{h}</dd></Fragment>))}
                        </dl>
                    ) : <p className="muted">Create a session to see state.</p>}
                </section>

                <section className="card">
                    <h2>Trade</h2>
                    <label>Buyer
                        <select value={buyer} onChange={(e) => setBuyer(Number(e.target.value))}>
                            {Array.from({ length: BUYERS }, (_, i) => <option key={i} value={i}>Buyer {i + 1}</option>)}
                        </select>
                    </label>
                    <label>Amount
                        <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </label>
                    <div className="row">
                        <button className="buy" onClick={trade('buy')} disabled={!view || !!busy}>Buy</button>
                        <button onClick={trade('sell')} disabled={!view || !!busy}>Sell</button>
                    </div>
                </section>

                <section className="card">
                    <h2>Scenario</h2>
                    <p className="muted">New artist, random trades, then everyone sells all. Same seed = same trades.</p>
                    {Object.keys(scenario).map((k) => (
                        <label key={k}>{k}
                            <input type="number" min="1" value={scenario[k]} onChange={(e) => setScenario({ ...scenario, [k]: Number(e.target.value) })} />
                        </label>
                    ))}
                    <button onClick={run} disabled={!deployed || !!busy}>Run scenario</button>
                </section>
            </div>

            {runs.length > 0 && (
                <section className="card">
                    <h2>Scenario runs</h2>
                    <table>
                        <thead><tr><th>Result</th><th>Seed</th><th>Trades</th><th>Buy CU avg / max</th><th>Sell CU avg / max</th><th>Fees</th><th>Errors</th></tr></thead>
                        <tbody>
                            {runs.map((r, i) => (
                                <tr key={i}>
                                    <td className={r.pass ? 'ok' : 'bad'}>{r.pass ? 'pass' : 'fail'}</td>
                                    <td>{r.seed}</td><td>{r.trades}</td>
                                    <td>{r.buy.cuAvg} / {r.buy.cuMax}</td><td>{r.sell.cuAvg} / {r.sell.cuMax}</td>
                                    <td>{sol(r.feesCollected)}</td>
                                    <td className="muted">{r.errors.join('; ') || Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k).join(', ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <section className="card">
                <h2>Transactions</h2>
                <table>
                    <thead><tr><th>Action</th><th>Who</th><th>Amount</th><th>CU</th><th>Reserve Δ</th><th>Fee Δ</th><th>Result</th></tr></thead>
                    <tbody>
                        {log.map((r, i) => (
                            <tr key={i}>
                                <td>{r.action}</td><td>{r.who ?? '—'}</td><td>{r.amount}</td><td>{r.cu ?? '—'}</td>
                                <td>{r.ok ? sol(r.reserveDelta) : '—'}</td><td>{r.ok ? sol(r.feeDelta) : '—'}</td>
                                <td className={r.ok ? 'ok' : 'bad'}>{r.ok ? 'ok' : r.error}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
