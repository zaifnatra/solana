#!/usr/bin/env python3
"""Verify a portable SQLite archive without exposing credentials or profile data."""
import json
from contextlib import closing
import sqlite3
import sys
import tarfile
import tempfile
from pathlib import Path


def verify(archive_path):
    with tempfile.TemporaryDirectory(prefix="mtl-verify-") as directory:
        snapshot = Path(directory) / "snapshot.sqlite3"
        with tarfile.open(archive_path, "r:gz") as archive:
            members = archive.getmembers()
            if len(members) != 1 or members[0].name != "snapshot.sqlite3" or not members[0].isfile():
                raise ValueError("Backup must contain only the regular file snapshot.sqlite3")
            # Copy only this explicitly allowed regular member; never extract paths or links.
            source = archive.extractfile(members[0])
            if source is None:
                raise ValueError("Missing database file")
            with source, snapshot.open("wb") as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
        with closing(sqlite3.connect(f"{snapshot.as_uri()}?mode=ro", uri=True)) as db:
            if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ValueError("SQLite integrity check failed")
            if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise ValueError("Foreign key check failed")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version < 1:
                raise ValueError("Not an initialized MTL database")
            accounts, cash = db.execute("SELECT COUNT(*), COALESCE(SUM(cash),0) FROM accounts").fetchone()
            fees = db.execute("SELECT COALESCE(SUM(fee_lamports),0) FROM trades").fetchone()[0]
            reserve_total = 0
            for symbol, supply, reserve in db.execute("SELECT symbol,supply,reserve FROM markets"):
                held = db.execute("SELECT COALESCE(SUM(quantity),0) FROM holdings WHERE symbol=?", (symbol,)).fetchone()[0]
                if supply != held or reserve != 1_000_000 * supply * supply // 2:
                    raise ValueError("Market supply or reserve does not reconcile")
                reserve_total += reserve
            if cash + fees + reserve_total != accounts * 100_000_000_000:
                raise ValueError("Paper cash, reserve, and fee conservation check failed")
            trades = db.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
            return {"integrity": "ok", "accounting": "balanced", "schema": version, "accounts": accounts, "trades": trades}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 deploy/verify_backup.py /path/to/backup.tgz")
    try:
        print(json.dumps(verify(sys.argv[1]), sort_keys=True))
    except (OSError, sqlite3.Error, tarfile.TarError, ValueError) as error:
        raise SystemExit(f"Backup verification failed: {error}") from error


if __name__ == "__main__":
    main()
