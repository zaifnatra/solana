// Headless scenario run. Prints JSON, exits 1 if a check fails.
// Usage: npm run scenario -- --trades 100 --seed 7 --buyers 3 --max-amount 20
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createStaging, runScenario } from './src/engine.js';

const { values } = parseArgs({
    options: {
        trades: { type: 'string', default: '50' },
        seed: { type: 'string', default: '1' },
        buyers: { type: 'string', default: '3' },
        'max-amount': { type: 'string', default: '20' },
    },
});
const idl = JSON.parse(readFileSync(new URL('../engine/target/idl/sol_proj.json', import.meta.url)));
const s = createStaging({ idl, rpcUrl: process.env.RPC_URL ?? 'http://127.0.0.1:8899' });

if (!(await s.programDeployed())) {
    console.error(`Program ${s.program.programId} is not deployed at ${s.connection.rpcEndpoint}. Run: cd engine && anchor localnet`);
    process.exit(2);
}
const result = await runScenario(s, {
    trades: Number(values.trades),
    seed: Number(values.seed),
    buyers: Number(values.buyers),
    maxAmount: Number(values['max-amount']),
});
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
