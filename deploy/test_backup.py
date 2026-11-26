"""Small recovery tests runnable without Docker or third-party Python packages."""
import io
from contextlib import closing
import sqlite3
import tarfile
import tempfile
import unittest
from pathlib import Path
from verify_backup import verify


class BackupVerificationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.database = self.root / "snapshot.sqlite3"
        self.archive = self.root / "backup.tgz"
        with closing(sqlite3.connect(self.database)) as db, db:
            migration = Path(__file__).resolve().parents[1] / "service/migrations/001.sql"
            db.executescript(migration.read_text())
            db.execute("INSERT INTO accounts VALUES ('a','hash',99947500000,1)")
            db.execute("UPDATE markets SET supply=10,reserve=50000000 WHERE symbol='ECHO'")
            db.execute("INSERT INTO holdings VALUES ('a','ECHO',10)")
            db.execute("INSERT INTO trades VALUES ('t','a','key','{}','ECHO','buy',10,50000000,2500000,52500000,1)")

    def archive_database(self):
        with tarfile.open(self.archive, "w:gz") as archive:
            archive.add(self.database, arcname="snapshot.sqlite3")

    def test_accepts_consistent_snapshot(self):
        self.archive_database()
        self.assertEqual(verify(self.archive)["accounting"], "balanced")
        self.assertEqual(verify(self.archive)["trades"], 1)

    def test_rejects_unbalanced_cash(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE accounts SET cash=cash+1")
        self.archive_database()
        with self.assertRaisesRegex(ValueError, "conservation"):
            verify(self.archive)

    def test_rejects_broken_reserve(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE markets SET reserve=1 WHERE symbol='ECHO'")
        self.archive_database()
        with self.assertRaisesRegex(ValueError, "reserve"):
            verify(self.archive)

    def test_rejects_archive_paths(self):
        with tarfile.open(self.archive, "w:gz") as archive:
            member = tarfile.TarInfo("../snapshot.sqlite3")
            member.size = 4
            archive.addfile(member, io.BytesIO(b"data"))
        with self.assertRaisesRegex(ValueError, "regular file"):
            verify(self.archive)

    def test_rejects_symlink(self):
        with tarfile.open(self.archive, "w:gz") as archive:
            member = tarfile.TarInfo("snapshot.sqlite3")
            member.type = tarfile.SYMTYPE
            member.linkname = "/etc/passwd"
            archive.addfile(member)
        with self.assertRaisesRegex(ValueError, "regular file"):
            verify(self.archive)


if __name__ == "__main__":
    unittest.main()
