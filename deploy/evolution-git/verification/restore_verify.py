#!/usr/bin/env python3
"""Decrypt/extract ONLY into a new temporary directory, offline; never starts Forgejo."""
import argparse, hashlib, json, os, pathlib, re, sqlite3, subprocess, tarfile, tempfile

def validate_members(members):
    for m in members:
        p=pathlib.PurePosixPath(m.name)
        if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0]!='snapshot' or not (m.isfile() or m.isdir()):
            raise ValueError('Unsafe archive')
        if m.size>10*1024**3: raise ValueError('Oversized member')
    if sum(m.size for m in members)>50*1024**3: raise ValueError('Oversized archive')

def main():
    p=argparse.ArgumentParser(); p.add_argument('--artifact',required=True); p.add_argument('--manifest',required=True); p.add_argument('--identity-file',required=True); p.add_argument('--owner-approved',action='store_true'); a=p.parse_args()
    if not a.owner_approved: raise SystemExit('Owner approval required for isolated restore verification')
    artifact=pathlib.Path(a.artifact); identity=pathlib.Path(a.identity_file)
    if identity.stat().st_mode & 0o077 or artifact.stat().st_mode & 0o077: raise SystemExit('Artifact and identity must be private (0600)')
    manifest=json.loads(pathlib.Path(a.manifest).read_text())
    with artifact.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
    if digest!=manifest.get('sha256'): raise SystemExit('Checksum mismatch; nothing extracted')
    os.umask(0o077); report={'checksum':'passed','git':[],'sqlite':[],'applicationRestore':'not_verified','externalDatabaseRestore':'not_verified'}
    try:
        with tempfile.TemporaryDirectory(prefix='evolution-isolated-restore-') as tmp:
            root=pathlib.Path(tmp); archive=root/'archive.tar'
            r=subprocess.run(['age','-d','-i',str(identity),'-o',str(archive),str(artifact)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if r.returncode: raise ValueError()
            with tarfile.open(archive) as t:
                members=t.getmembers(); validate_members(members); t.extractall(root/'copy',members=members,filter='data')
            snapshot=root/'copy'/'snapshot'
            for head in snapshot.rglob('HEAD'):
                repo=head.parent
                if not (repo/'objects').is_dir(): continue
                if (repo/'objects'/'info'/'alternates').exists(): raise ValueError('External object storage is not permitted in isolated verification')
                result=subprocess.run(['git','--no-optional-locks','--git-dir='+str(repo),'fsck','--full'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=120)
                refs=subprocess.run(['git','--no-optional-locks','--git-dir='+str(repo),'for-each-ref','--format=%(refname) %(objectname)','refs/heads','refs/tags'],capture_output=True,text=True,timeout=20)
                safe=[line for line in refs.stdout.splitlines() if re.fullmatch(r'refs/(heads|tags)/[A-Za-z0-9_./-]+ [a-f0-9]{40,64}',line)] if refs.returncode==0 else []
                report['git'].append({'path':str(repo.relative_to(snapshot)),'fsck':result.returncode==0,'refs':safe})
            for db in snapshot.rglob('*.db'):
                try:
                    c=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True); rows=c.execute('PRAGMA integrity_check').fetchall(); c.close(); ok=rows==[('ok',)]
                except Exception: ok=False
                report['sqlite'].append({'path':str(db.relative_to(snapshot)),'integrity':ok})
            report['storageChecksPassed']=bool(report['git']) and all(r['fsck'] for r in report['git']) and bool(report['sqlite']) and all(r['integrity'] for r in report['sqlite'])
        print(json.dumps(report,indent=2))
    except Exception: raise SystemExit('Isolated verification failed; no production paths modified')
if __name__=='__main__': main()
