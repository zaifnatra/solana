// The only place the UI talks to the tokenization engine (engine/).
// Mocked for now. To connect the real program, generate a client from
// engine/target/idl/sol_proj.json and replace these bodies. Keep the signatures.

const fakeTx = () =>
    new Promise((resolve) => setTimeout(() => resolve(`mock-tx-${Date.now()}`), 400));

export async function registerArtist() {
    return { signature: await fakeTx(), mint: 'mock-mint' };
}

export async function buyToken(_artistWallet, _amount) {
    return fakeTx();
}

export async function sellToken(_artistWallet, _amount) {
    return fakeTx();
}
