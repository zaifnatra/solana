-- An append-only audit journal, not a distributed consensus protocol.
CREATE TABLE trade_audit (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    sequence INTEGER NOT NULL CHECK(sequence > 0),
    trade_id TEXT NOT NULL UNIQUE REFERENCES trades(id),
    previous_hash TEXT NOT NULL CHECK(length(previous_hash) = 64),
    entry_hash TEXT NOT NULL CHECK(length(entry_hash) = 64),
    PRIMARY KEY(account_id, sequence)
);
CREATE TRIGGER trade_audit_no_update BEFORE UPDATE ON trade_audit
BEGIN SELECT RAISE(ABORT, 'audit entries are append-only'); END;
CREATE TRIGGER trade_audit_no_delete BEFORE DELETE ON trade_audit
BEGIN SELECT RAISE(ABORT, 'audit entries are append-only'); END;
PRAGMA user_version = 3;
