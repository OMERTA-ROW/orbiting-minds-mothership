#!/usr/bin/env python3
"""Package an OWNER-PREPARED consistent snapshot; never touches live Forgejo."""
import argparse, hashlib, json, os, pathlib, subprocess, tarfile, tempfile

def main():
    p=argparse.ArgumentParser(); p.add_argument('--snapshot',required=True); p.add_argument('--destination',required=True); p.add_argument('--recipient',required=True); p.add_argument('--owner-approved',action='store_true'); p.add_argument('--consistent-snapshot-confirmed',action='store_true'); a=p.parse_args()
    if not a.owner_approved or not a.consistent_snapshot_confirmed: raise SystemExit('Owner approval and consistent snapshot confirmation required')
    source=pathlib.Path(a.snapshot).resolve(); dest=pathlib.Path(a.destination).resolve()
    if not source.is_dir() or not dest.is_dir() or dest==source or source in dest.parents: raise SystemExit('Use an existing independent secure destination')
    if dest.stat().st_mode & 0o077: raise SystemExit('Destination must be private (0700)')
    for entry in source.rglob('*'):
        if entry.is_symlink() or not (entry.is_file() or entry.is_dir()): raise SystemExit('Snapshot contains unsupported entries')
    output=dest/'forgejo-snapshot.tar.age'; manifest=dest/'forgejo-snapshot.sha256.json'
    if output.exists() or manifest.exists(): raise SystemExit('Refusing overwrite; use a fresh destination')
    os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix='evolution-backup-') as tmp:
            archive=pathlib.Path(tmp)/'snapshot.tar'
            with tarfile.open(archive,'w') as t: t.add(source,arcname='snapshot',recursive=True)
            r=subprocess.run(['age','-r',a.recipient,'-o',str(output),str(archive)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if r.returncode: raise RuntimeError()
        with output.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
        with manifest.open('x') as f: json.dump({'artifact':output.name,'sha256':digest,'consistency':'owner-confirmed snapshot; not independently verified','restore':'pending'},f)
        print('Encrypted snapshot and checksum created; restore verification still required.')
    except Exception: raise SystemExit('Backup did not complete; secure partial artifacts require owner review. No source changes made.')
if __name__=='__main__': main()
