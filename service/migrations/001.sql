CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    cash INTEGER NOT NULL CHECK(cash >= 0),
    created_at INTEGER NOT NULL
);
CREATE TABLE markets (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    genre TEXT NOT NULL,
    supply INTEGER NOT NULL DEFAULT 0 CHECK(supply BETWEEN 0 AND 100000),
    reserve INTEGER NOT NULL DEFAULT 0 CHECK(reserve >= 0)
);
CREATE TABLE holdings (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    symbol TEXT NOT NULL REFERENCES markets(symbol),
    quantity INTEGER NOT NULL CHECK(quantity >= 0),
    PRIMARY KEY(account_id, symbol)
);
CREATE TABLE trades (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    idempotency_key TEXT NOT NULL,
    request_json TEXT NOT NULL,
    symbol TEXT NOT NULL REFERENCES markets(symbol),
    side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    gross_lamports INTEGER NOT NULL CHECK(gross_lamports > 0),
    fee_lamports INTEGER NOT NULL CHECK(fee_lamports >= 0),
    total_lamports INTEGER NOT NULL CHECK(total_lamports > 0),
    created_at INTEGER NOT NULL,
    UNIQUE(account_id, idempotency_key)
);
CREATE INDEX trades_account_time ON trades(account_id, created_at DESC);
INSERT INTO markets(symbol, name, genre) VALUES
    ('ECHO', 'Echo District', 'Electronic'),
    ('NOVA', 'Nova Collective', 'Alternative'),
    ('MUSE', 'Midnight Muse', 'Jazz');
PRAGMA user_version = 1;
