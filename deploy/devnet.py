#!/usr/bin/env python3
"""Explicit, devnet-only build/deploy workflow. Never changes the shared engine.

No command installs software, requests an airdrop, funds a wallet, or selects
mainnet. Only deploy and register submit transactions, using valueless devnet SOL.
All private state is under deploy/devnet-state, which must remain gitignored.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "deploy/devnet-state"
RPC = "https://api.devnet.solana.com"
GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
WORK = STATE / "workspace"
BASE58 = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}\Z")


def command(args, cwd=ROOT):
    # Capture stderr too: CLI failures must not echo local credentials or secrets.
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=False)
    if result.returncode:
        logs = STATE / "logs"
        logs.mkdir(mode=0o700, parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", prefix="cli-", suffix=".log", dir=logs, delete=False) as log:
            log.write(result.stdout + "\n" + result.stderr)
            diagnostic = log.name
        raise ValueError(f"{Path(args[0]).name} {args[1] if len(args) > 1 else ''} failed (exit {result.returncode}); private diagnostic: {diagnostic}")
    return result.stdout.strip()


def keypath(value):
    if not isinstance(value, str):
        raise ValueError("Keypair path must be a string")
    path = (ROOT / value).resolve()
    keys = STATE / "keys"
    if keys.resolve() != keys.absolute():
        raise ValueError("Devnet key directory must not be a symbolic link")
    if not path.is_relative_to(keys) or path == keys or path.suffix != ".json":
        raise ValueError("Dedicated devnet keys must be JSON files beneath deploy/devnet-state/keys")
    return path


def read_key(path):
    # A Solana keypair file is 64 bytes encoded as a JSON array. Validate before
    # passing any key material to tools; never print the file or its contents.
    if path.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise ValueError("Keypair files must be private: chmod 600 the local keypair files")
    if path.stat().st_size > 4096:
        raise ValueError("Invalid keypair size")
    value = json.loads(path.read_text())
    if not isinstance(value, list) or len(value) != 64 or any(type(x) is not int or not 0 <= x <= 255 for x in value):
        raise ValueError("Invalid keypair file")
    return path


def load_config(path):
    config = json.loads(path.read_text())
    required = {"version", "cluster", "rpc_url", "genesis_hash", "payer_keypair", "program_keypair", "fee_wallet_keypair", "platform_wallet", "artists"}
    if not isinstance(config, dict) or set(config) != required:
        raise ValueError("Unexpected or missing devnet configuration fields")
    if type(config["version"]) is not int or config["version"] != 1 or config["cluster"] != "devnet" or config["rpc_url"] != RPC or config["genesis_hash"] != GENESIS:
        raise ValueError("This workflow accepts only the explicit public devnet RPC and devnet genesis")
    if not isinstance(config["platform_wallet"], str) or not BASE58.fullmatch(config["platform_wallet"]):
        raise ValueError("Set platform_wallet to the public key of your chosen devnet fee wallet")
    artists = config["artists"]
    if not isinstance(artists, list) or not 1 <= len(artists) <= 16:
        raise ValueError("Configure between 1 and 16 devnet artists")
    seen_symbols = set()
    for artist in artists:
        if not isinstance(artist, dict) or set(artist) != {"symbol", "name", "keypair"}:
            raise ValueError("Invalid artist configuration fields")
        if not isinstance(artist["symbol"], str) or not re.fullmatch(r"[A-Z][A-Z0-9]{1,11}", artist["symbol"]) or artist["symbol"] in seen_symbols:
            raise ValueError("Artist symbols must start with a letter and contain 2–12 uppercase letters/digits")
        seen_symbols.add(artist["symbol"])
        if not isinstance(artist["name"], str) or not 1 <= len(artist["name"].strip()) <= 80:
            raise ValueError("Artist name must be 1–80 characters")
        keypath(artist["keypair"])
    for key in ["payer_keypair", "program_keypair", "fee_wallet_keypair"]:
        keypath(config[key])
    return config


def pubkey(path):
    value = command(["solana-keygen", "pubkey", str(read_key(path))])
    if not BASE58.fullmatch(value):
        raise ValueError("Invalid public key returned by solana-keygen")
    return value


def assert_network(config):
    # Explicit URL on every CLI command: never inherit `solana config` network.
    actual = command(["solana", "genesis-hash", "--url", config["rpc_url"]])
    if actual != GENESIS:
        raise ValueError("RPC genesis mismatch: refusing to use any network except devnet")


def preflight(config):
    assert_network(config)
    payer = pubkey(keypath(config["payer_keypair"]))
    program = pubkey(keypath(config["program_keypair"]))
    fee = pubkey(keypath(config["fee_wallet_keypair"]))
    artists = [pubkey(keypath(a["keypair"])) for a in config["artists"]]
    if fee != config["platform_wallet"]:
        raise ValueError("Fee wallet public key does not match the explicitly chosen local fee keypair")
    if len(set(artists)) != len(artists):
        raise ValueError("Each artist requires a distinct authority")
    if program in [payer, fee, *artists]:
        raise ValueError("Program identity must use a dedicated keypair, separate from all wallets")
    source = (ROOT / "engine/programs/sol_proj/src/lib.rs").read_text()
    declared = re.search(r'declare_id!\("([^"]+)"\)', source)
    if not declared or program == declared.group(1):
        raise ValueError("Generate a dedicated program identity; do not reuse the repository's original program ID")
    return {"payer": payer, "program": program, "fee": fee, "artists": artists}


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def config_hash(config):
    return hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()


def prepare(config):
    identities = preflight(config)
    if WORK.exists():
        raise ValueError("Prepared workspace already exists; keep it for this build or move it aside before preparing new sources")
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    shutil.copytree(ROOT / "engine", WORK, ignore=shutil.ignore_patterns("target", ".anchor", "node_modules", "test-ledger", ".git"))
    source_path = WORK / "programs/sol_proj/src/lib.rs"
    source = source_path.read_text()
    source, count = re.subn(r'declare_id!\("[^"]+"\);', f'declare_id!("{identities["program"]}");', source)
    if count != 1:
        raise ValueError("Expected exactly one program identity declaration")
    source, count = re.subn(r'pub const PLATFORM_WALLET: Pubkey = pubkey!\("[^"]+"\);', f'pub const PLATFORM_WALLET: Pubkey = pubkey!("{identities["fee"]}");', source)
    if count != 1:
        raise ValueError("Expected exactly one fee-wallet declaration")
    source_path.write_text(source)
    (WORK / "Anchor.toml").write_text('[features]\nresolution = true\nskip-lint = false\n\n[programs.devnet]\nsol_proj = "' + identities["program"] + '"\n\n[provider]\ncluster = "devnet"\nwallet = ' + json.dumps(str(keypath(config["payer_keypair"]))) + '\n')
    target = WORK / "target/deploy"
    target.mkdir(parents=True)
    shutil.copyfile(keypath(config["program_keypair"]), target / "sol_proj-keypair.json")
    (target / "sol_proj-keypair.json").chmod(0o600)
    write_json(STATE / "prepared.json", {"config_sha256": config_hash(config), "program_id": identities["program"], "platform_wallet": identities["fee"]})
    print("Prepared isolated devnet source workspace. No deployment or funding occurred.")


def prepared(config):
    identities = preflight(config)
    record = json.loads((STATE / "prepared.json").read_text())
    if record != {"config_sha256": config_hash(config), "program_id": identities["program"], "platform_wallet": identities["fee"]}:
        raise ValueError("Configuration changed after preparation; prepare a fresh isolated workspace")
    return identities


def artifacts(config):
    identities = prepared(config)
    binary = WORK / "target/deploy/sol_proj.so"
    idl_path = WORK / "target/idl/sol_proj.json"
    idl = json.loads(idl_path.read_text())
    if not binary.is_file() or not binary.stat().st_size or idl.get("address") != identities["program"]:
        raise ValueError("Missing build artifacts or IDL program identity mismatch")
    instructions = {i["name"]: i for i in idl["instructions"]}
    expected = {"buy_token_bounded": [("amount", "u64"), ("max_total_lamports", "u64"), ("expires_at", "i64")], "sell_token_bounded": [("amount", "u64"), ("min_total_lamports", "u64"), ("expires_at", "i64")]}
    for name, args in expected.items():
        instruction = instructions.get(name, {})
        if [(a["name"], a["type"]) for a in instruction.get("args", [])] != args:
            raise ValueError("Build does not expose the bounded-trade ABI version 2")
        fee = next((a for a in instruction.get("accounts", []) if a["name"] == "platform_wallet"), {})
        if fee.get("address") != identities["fee"]:
            raise ValueError("IDL fee destination does not match the configured wallet")
    return identities, binary, idl_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init-program", "preflight", "prepare", "build", "deploy", "register"])
    parser.add_argument("--config", type=Path, default=ROOT / "deploy/devnet.config.json")
    args = parser.parse_args()
    os.umask(0o077)
    config = load_config(args.config.resolve())
    if args.action == "init-program":
        path = keypath(config["program_keypair"])
        if path.exists():
            raise ValueError("Program keypair already exists; refusing to replace it")
        path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        command(["solana-keygen", "new", "--no-bip39-passphrase", "--silent", "--outfile", str(path)])
        path.chmod(0o600)
        print("Created a dedicated local devnet program keypair. No network call or deployment occurred.")
    elif args.action == "preflight":
        preflight(config)
        print("Devnet network, isolated key paths, and selected fee-wallet identity verified.")
    elif args.action == "prepare":
        prepare(config)
    elif args.action == "build":
        prepared(config)
        command(["anchor", "build"], cwd=WORK)
        identities, binary, idl = artifacts(config)
        public = STATE / "public"
        public.mkdir(exist_ok=True)
        shutil.copyfile(idl, public / "sol_proj.json")
        write_json(public / "build.json", {"version": 1, "abi_version": 2, "cluster": "devnet", "genesis_hash": GENESIS, "program_id": identities["program"], "platform_wallet": identities["fee"], "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(), "idl_sha256": hashlib.sha256(idl.read_bytes()).hexdigest()})
        print("Built isolated devnet program and public provenance. No deployment occurred.")
    elif args.action == "deploy":
        _, binary, _ = artifacts(config)
        assert_network(config)
        command(["solana", "program", "deploy", "--url", RPC, "--keypair", str(keypath(config["payer_keypair"])), "--upgrade-authority", str(keypath(config["payer_keypair"])), "--program-id", str(keypath(config["program_keypair"])), str(binary)])
        print("Submitted devnet program deployment. Run register to verify accounts and publish a manifest.")
    elif args.action == "register":
        artifacts(config)
        assert_network(config)
        command(["node", str(ROOT / "deploy/devnet-register.mjs"), str(args.config.resolve())])
        print("Verified devnet artist accounts and wrote public/devnet-markets.json beneath deploy/devnet-state.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Devnet setup stopped: {error}", file=sys.stderr)
        sys.exit(1)
