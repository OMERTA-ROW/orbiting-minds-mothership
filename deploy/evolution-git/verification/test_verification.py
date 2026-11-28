import importlib.util, io, json, os, pathlib, subprocess, sys, tarfile, tempfile, unittest
from unittest.mock import patch
BASE=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('restore_checks',BASE/'restore_verify.py'); restore=importlib.util.module_from_spec(spec); spec.loader.exec_module(restore)
class VerificationTests(unittest.TestCase):
    def test_traversal_rejected(self):
        with self.assertRaises(ValueError): restore.validate_members([tarfile.TarInfo('snapshot/../production')])
    def test_absolute_rejected(self):
        with self.assertRaises(ValueError): restore.validate_members([tarfile.TarInfo('/production')])
    def test_links_rejected(self):
        for kind in [tarfile.SYMTYPE,tarfile.LNKTYPE,tarfile.CHRTYPE]:
            m=tarfile.TarInfo('snapshot/link');m.type=kind
            with self.assertRaises(ValueError): restore.validate_members([m])
    def test_oversized_rejected(self):
        m=tarfile.TarInfo('snapshot/large');m.size=11*1024**3
        with self.assertRaises(ValueError): restore.validate_members([m])
    def test_safe_member_allowed(self):
        restore.validate_members([tarfile.TarInfo('snapshot/repos/r/HEAD')])
    def test_backup_requires_explicit_approval(self):
        r=subprocess.run([sys.executable,str(BASE/'backup.py'),'--snapshot','/not-used','--destination','/not-used','--recipient','not-used'],capture_output=True,text=True)
        self.assertNotEqual(r.returncode,0);self.assertIn('Owner approval',r.stderr)
    def test_restore_requires_explicit_approval(self):
        r=subprocess.run([sys.executable,str(BASE/'restore_verify.py'),'--artifact','/not-used','--manifest','/not-used','--identity-file','/not-used'],capture_output=True,text=True)
        self.assertNotEqual(r.returncode,0);self.assertIn('Owner approval',r.stderr)
    def test_checksum_mismatch_before_decryption(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);artifact=root/'backup';identity=root/'key';manifest=root/'manifest'
            artifact.write_bytes(b'not-a-backup');identity.write_text('not-a-key');manifest.write_text(json.dumps({'sha256':'bad'}));artifact.chmod(0o600);identity.chmod(0o600)
            r=subprocess.run([sys.executable,str(BASE/'restore_verify.py'),'--artifact',str(artifact),'--manifest',str(manifest),'--identity-file',str(identity),'--owner-approved'],capture_output=True,text=True)
            self.assertNotEqual(r.returncode,0);self.assertIn('Checksum mismatch',r.stderr);self.assertNotIn('not-a-key',r.stderr)
    def test_disposable_encrypted_snapshot_sqlite_and_ref_roundtrip(self):
        # Actual local age/SQLite/ref exercise; sandbox forbids git fsck,
        # so full Git integrity and Omni-Staging recovery remain unverified.
        import sqlite3
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);source=root/'snapshot';dest=root/'backup';source.mkdir();dest.mkdir(mode=0o700);key=root/'identity'
            subprocess.run(['age-keygen','-o',str(key)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);key.chmod(0o600)
            recipient=subprocess.run(['age-keygen','-y',str(key)],check=True,capture_output=True,text=True).stdout.strip()
            # Static valid Git objects avoid any repository mutation command;
            # actual Git subsequently verifies the decrypted copy with fsck.
            import hashlib, zlib
            repo=source/'r.git';(repo/'objects').mkdir(parents=True);(repo/'refs'/'heads').mkdir(parents=True)
            (repo/'HEAD').write_text('ref: refs/heads/main\n');(repo/'config').write_text('[core]\n repositoryformatversion = 0\n bare = true\n')
            def object_file(kind,body):
                payload=kind.encode()+b' '+str(len(body)).encode()+b'\0'+body
                oid=hashlib.sha1(payload).hexdigest();folder=repo/'objects'/oid[:2];folder.mkdir(exist_ok=True);(folder/oid[2:]).write_bytes(zlib.compress(payload));return oid
            tree=object_file('tree',b'')
            commit=object_file('commit',f'tree {tree}\nauthor Fixture <fixture@example.test> 1700000000 +0000\ncommitter Fixture <fixture@example.test> 1700000000 +0000\n\nDisposable recovery fixture\n'.encode())
            (repo/'refs'/'heads'/'main').write_text(commit+'\n')
            db=sqlite3.connect(source/'forgejo.db');db.execute('create table evidence (value text)');db.execute("insert into evidence values ('fixture')");db.commit();db.close()
            r=subprocess.run([sys.executable,str(BASE/'backup.py'),'--snapshot',str(source),'--destination',str(dest),'--recipient',recipient,'--owner-approved','--consistent-snapshot-confirmed'],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            r=subprocess.run([sys.executable,str(BASE/'restore_verify.py'),'--artifact',str(dest/'forgejo-snapshot.tar.age'),'--manifest',str(dest/'forgejo-snapshot.sha256.json'),'--identity-file',str(key),'--owner-approved'],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr);result=json.loads(r.stdout);self.assertEqual(result['checksum'],'passed');self.assertTrue(result['sqlite'][0]['integrity']);self.assertIn('refs/heads/main '+commit,result['git'][0]['refs']);self.assertEqual(result['applicationRestore'],'not_verified')
            if not result['git'][0]['fsck']: self.assertFalse(result['storageChecksPassed'])
            self.assertTrue((source/'forgejo.db').exists());self.assertNotIn('AGE-SECRET',r.stdout)
    def test_diagnostic_redacts_journal_and_environment(self):
        spec=importlib.util.spec_from_file_location('diag_checks',BASE/'diagnose.py');diag=importlib.util.module_from_spec(spec);spec.loader.exec_module(diag)
        with tempfile.TemporaryDirectory() as tmp:
            def read(command):
                if command[0]=='systemctl': return 'ActiveState=active\nExecStart=sensitive\n'
                if command[0]=='journalctl': return json.dumps({'MESSAGE':'sensitive','_SYSTEMD_INVOCATION_ID':'unit-id','EXIT_STATUS':'0'})
                return None
            output=io.StringIO()
            with patch.object(sys,'argv',['diagnose.py','--timer','sync.timer','--service','sync.service','--repo-root',tmp]),patch.object(diag,'read',read),patch('sys.stdout',output): diag.main()
            report=json.loads(output.getvalue());self.assertNotIn('sensitive',output.getvalue());self.assertEqual(report['recentEvidence']['invocations24h'],1);self.assertEqual(report['units']['sync.timer']['ActiveState'],'active')
    def test_backup_refuses_public_destination(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=pathlib.Path(tmp)/'source';dest=pathlib.Path(tmp)/'dest';source.mkdir();dest.mkdir();dest.chmod(0o755)
            r=subprocess.run([sys.executable,str(BASE/'backup.py'),'--snapshot',str(source),'--destination',str(dest),'--recipient','unit','--owner-approved','--consistent-snapshot-confirmed'],capture_output=True,text=True)
            self.assertNotEqual(r.returncode,0);self.assertIn('private',r.stderr);self.assertEqual(list(dest.iterdir()),[])
if __name__=='__main__': unittest.main(verbosity=2)
