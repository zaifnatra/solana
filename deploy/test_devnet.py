"""Offline devnet workflow tests: no installed Solana tools or network needed."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import devnet


class DevnetWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.state = self.root / "deploy/devnet-state"
        self.work = self.state / "workspace"
        for name, value in [("ROOT", self.root), ("STATE", self.state), ("WORK", self.work)]:
            patcher = patch.object(devnet, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.program = "2" * 44
        self.payer = "3" * 44
        self.fee = "4" * 44
        self.artist = "5" * 44
        self.config = {"version": 1, "cluster": "devnet", "rpc_url": devnet.RPC, "genesis_hash": devnet.GENESIS, "payer_keypair": "deploy/devnet-state/keys/payer.json", "program_keypair": "deploy/devnet-state/keys/program.json", "fee_wallet_keypair": "deploy/devnet-state/keys/fee.json", "platform_wallet": self.fee, "artists": [{"symbol": "DEMO", "name": "Devnet artist", "keypair": "deploy/devnet-state/keys/artist.json"}]}
        self.config_path = self.root / "config.json"
        self.config_path.write_text(json.dumps(self.config))
        self.keys = self.state / "keys"
        self.keys.mkdir(parents=True)
        for name in ["payer", "program", "fee", "artist"]:
            path = self.keys / (name + ".json")
            path.write_text(json.dumps(list(range(64))))
            path.chmod(0o600)
        self.source = self.root / "engine/programs/sol_proj/src/lib.rs"
        self.source.parent.mkdir(parents=True)
        self.original = 'declare_id!("' + "6" * 44 + '");\npub const PLATFORM_WALLET: Pubkey = pubkey!("' + "7" * 44 + '");\n'
        self.source.write_text(self.original)
        self.calls = []
        self.genesis = devnet.GENESIS
        patcher = patch.object(subprocess, "run", side_effect=self.fake_cli)
        patcher.start()
        self.addCleanup(patcher.stop)

    def fake_cli(self, args, **kwargs):
        self.calls.append(args)
        if args[:2] == ["solana", "genesis-hash"]:
            return subprocess.CompletedProcess(args, 0, self.genesis + "\n", "")
        if args[:2] == ["solana-keygen", "pubkey"]:
            value = {"payer": self.payer, "program": self.program, "fee": self.fee, "artist": self.artist}[Path(args[2]).stem]
            return subprocess.CompletedProcess(args, 0, value + "\n", "")
        raise AssertionError(f"Unexpected CLI operation: {args[0:2]}")

    def test_rejects_network_and_unknown_configuration_before_any_cli_call(self):
        for field, value in [("cluster", "mainnet-beta"), ("rpc_url", "https://api.mainnet-beta.solana.com"), ("rpc_url", "https://my-paid-provider.example"), ("genesis_hash", "wrong"), ("unknown", "x")]:
            config = copy.deepcopy(self.config)
            config[field] = value
            self.config_path.write_text(json.dumps(config))
            with self.assertRaises(ValueError):
                devnet.load_config(self.config_path)
        self.assertEqual(self.calls, [])

    def test_rejects_mainnet_genesis_before_key_loading_or_preparation(self):
        self.genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
        with self.assertRaisesRegex(ValueError, "genesis mismatch"):
            devnet.prepare(self.config)
        self.assertEqual(len(self.calls), 1)
        self.assertFalse(self.work.exists())

    def test_fee_ownership_and_separate_program_identity_are_required(self):
        config = copy.deepcopy(self.config)
        config["platform_wallet"] = self.payer
        with self.assertRaisesRegex(ValueError, "Fee wallet"):
            devnet.preflight(config)
        self.program = self.artist
        with self.assertRaisesRegex(ValueError, "dedicated keypair"):
            devnet.preflight(self.config)

    def test_refuses_shared_declared_program_identity(self):
        self.program = "6" * 44
        with self.assertRaisesRegex(ValueError, "dedicated program identity"):
            devnet.preflight(self.config)

    def test_keypaths_and_permissions_fail_closed(self):
        for path in ["/tmp/real-wallet.json", "engine/keypair.json", "deploy/devnet-state/keys/../outside.json"]:
            with self.assertRaises(ValueError):
                devnet.keypath(path)
        path = self.keys / "payer.json"
        path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "private"):
            devnet.read_key(path)
        path.chmod(0o600)
        path.write_text('[1,2,3]')
        with self.assertRaisesRegex(ValueError, "Invalid keypair"):
            devnet.read_key(path)

    def test_symlink_escape_is_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        target = outside / "wallet.json"
        target.write_text("[]")
        (self.keys / "escape.json").symlink_to(target)
        with self.assertRaises(ValueError):
            devnet.keypath("deploy/devnet-state/keys/escape.json")

    def test_prepare_copies_identity_and_fee_without_changing_source_or_deploying(self):
        devnet.prepare(self.config)
        self.assertEqual(self.source.read_text(), self.original)
        rendered = (self.work / "programs/sol_proj/src/lib.rs").read_text()
        self.assertIn(self.program, rendered)
        self.assertIn(self.fee, rendered)
        anchor = (self.work / "Anchor.toml").read_text()
        self.assertIn('[programs.devnet]', anchor)
        self.assertIn('cluster = "devnet"', anchor)
        self.assertEqual((self.work / "target/deploy/sol_proj-keypair.json").stat().st_mode & 0o777, 0o600)
        self.assertTrue(all(args[1] in ["pubkey", "genesis-hash"] for args in self.calls))
        with self.assertRaisesRegex(ValueError, "already exists"):
            devnet.prepare(self.config)

    def test_config_changes_invalidate_preparation(self):
        devnet.prepare(self.config)
        self.config["artists"][0]["name"] = "Changed"
        with self.assertRaisesRegex(ValueError, "changed after preparation"):
            devnet.prepared(self.config)

    def make_artifacts(self):
        devnet.prepare(self.config)
        (self.work / "target/deploy/sol_proj.so").write_bytes(b"mock-binary")
        path = self.work / "target/idl/sol_proj.json"
        path.parent.mkdir()
        instructions = []
        for name, limit in [("buy_token_bounded", "max_total_lamports"), ("sell_token_bounded", "min_total_lamports")]:
            instructions.append({"name": name, "args": [{"name": "amount", "type": "u64"}, {"name": limit, "type": "u64"}, {"name": "expires_at", "type": "i64"}], "accounts": [{"name": "platform_wallet", "address": self.fee}]})
        idl = {"address": self.program, "instructions": instructions}
        path.write_text(json.dumps(idl))
        return path, idl

    def test_old_unbounded_abi_and_wrong_fee_cannot_deploy(self):
        path, idl = self.make_artifacts()
        devnet.artifacts(self.config)
        idl["instructions"][0]["args"] = [{"name": "amount", "type": "u64"}]
        path.write_text(json.dumps(idl))
        with self.assertRaisesRegex(ValueError, "ABI version 2"):
            devnet.artifacts(self.config)
        self.assertFalse(any(args[:3] == ["solana", "program", "deploy"] for args in self.calls))

    def test_old_instruction_names_are_rejected_even_with_new_argument_layout(self):
        path, idl = self.make_artifacts()
        idl["instructions"][0]["name"] = "buy_token"
        idl["instructions"][1]["name"] = "sell_token"
        path.write_text(json.dumps(idl))
        with self.assertRaisesRegex(ValueError, "ABI version 2"):
            devnet.artifacts(self.config)

    def test_digit_first_symbol_is_rejected_before_network_calls(self):
        config = copy.deepcopy(self.config)
        config["artists"][0]["symbol"] = "1ABC"
        self.config_path.write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, "start with a letter"):
            devnet.load_config(self.config_path)
        self.assertEqual(self.calls, [])

    def test_cli_errors_never_forward_captured_secret_output(self):
        with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "private-key-material", "secret-error")):
            with self.assertRaises(ValueError) as caught:
                devnet.command(["solana-keygen", "pubkey", "secret-path"])
        self.assertNotIn("private-key-material", str(caught.exception))
        self.assertNotIn("secret-error", str(caught.exception))
        self.assertNotIn("secret-path", str(caught.exception))
        logs = list((self.state / "logs").glob("*.log"))
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].stat().st_mode & 0o777, 0o600)
        self.assertIn("secret-error", logs[0].read_text())


if __name__ == "__main__":
    unittest.main()
