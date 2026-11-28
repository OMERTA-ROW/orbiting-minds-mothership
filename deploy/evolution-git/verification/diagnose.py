#!/usr/bin/env python3
"""Read-only host diagnostics. No sync invocation, raw logs, env or config output."""
import argparse, datetime, json, os, re, subprocess

def read(command):
    try:
        r = subprocess.run(command, capture_output=True, text=True, timeout=20)
        return r.stdout if r.returncode == 0 else None
    except Exception:
        return None

def main():
    p = argparse.ArgumentParser(); p.add_argument('--timer', required=True); p.add_argument('--service', required=True); p.add_argument('--repo-root', required=True)
    a = p.parse_args()
    if not all(re.fullmatch(r'[A-Za-z0-9_.@-]+', s) for s in (a.timer, a.service)):
        raise SystemExit('Invalid unit name')
    allowed = ['ActiveState','SubState','Result','ExecMainStatus','ExecMainCode','ActiveEnterTimestamp','InactiveEnterTimestamp','LastTriggerUSec','NextElapseUSecRealtime']
    report = {'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'mode':'read-only', 'units':{}, 'repositories':[], 'limitations':['Unit status and invocation counters do not prove all 38 syncs succeeded; reviewed per-run receipts required.', 'No remote URLs, credentials, config values or raw journal messages are output.', 'No independent upstream hash comparison or backup restore performed.']}
    for unit in (a.timer,a.service):
        text = read(['systemctl','show',unit,'--no-pager',*[f'--property={s}' for s in allowed]])
        report['units'][unit] = dict(line.split('=',1) for line in (text or '').splitlines() if '=' in line and line.split('=',1)[0] in allowed) if text is not None else {'state':'unavailable'}
    journal = read(['journalctl','-u',a.service,'--since','24 hours ago','--no-pager','-o','json'])
    invocations=set(); exit_events=0
    for line in (journal or '').splitlines():
        try:
            e=json.loads(line)
            if e.get('_SYSTEMD_INVOCATION_ID'): invocations.add(e['_SYSTEMD_INVOCATION_ID'])
            if e.get('EXIT_STATUS') == '0': exit_events+=1
        except Exception: pass
    report['recentEvidence']={'journalReadable':journal is not None,'invocations24h':len(invocations),'explicitZeroExitEvents':exit_events}
    root=os.path.realpath(a.repo_root)
    if root in ('/', '/var', '/home', '/root') or not os.path.isdir(root): raise SystemExit('Use the specific readable repository directory')
    for base, dirs, files in os.walk(root, followlinks=False):
        dirs[:]=[d for d in dirs if not os.path.islink(os.path.join(base,d))]
        if 'HEAD' not in files or 'objects' not in dirs: continue
        git=['git','--no-optional-locks','--git-dir='+base]
        refs=read(git+['for-each-ref','--format=%(refname) %(objectname)','refs/heads','refs/tags'])
        safe=[]
        for line in (refs or '').splitlines():
            if re.fullmatch(r'refs/(heads|tags)/[A-Za-z0-9_./-]+ [a-f0-9]{40,64}',line): safe.append(line)
        head=(read(git+['rev-parse','HEAD']) or '').strip()
        report['repositories'].append({'path':os.path.relpath(base,root),'refs':safe,'head':head if re.fullmatch(r'[a-f0-9]{40,64}',head) else None})
        dirs[:]=[]
    print(json.dumps(report,indent=2))
if __name__=='__main__': main()
