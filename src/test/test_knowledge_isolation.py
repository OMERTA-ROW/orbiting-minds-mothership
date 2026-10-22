"""Opt-in knowledge/audit regression using temporary QA accounts, --run.
No AI/feed calls; only existing stored records. Secrets never printed.
"""
import os
import secrets
import sys
import uuid
import requests

def main():
    if sys.argv[1:] != ['--run']: raise SystemExit('Use --run for temporary QA.')
    base=os.environ['SUPABASE_URL']; key=os.environ['SUPABASE_PUBLISHABLE_KEY']; admin=os.environ['SUPABASE_SERVICE_ROLE_KEY']
    users=[]; checks=0; owner=str(uuid.uuid4()); held=False
    def call(method,path,data=None,token=None,privileged=False):
        credential=admin if privileged else key
        headers={'apikey':credential,'Content-Type':'application/json','Prefer':'return=representation'}
        if token: headers['Authorization']='Bearer '+token
        elif privileged and not admin.startswith('sb_'): headers['Authorization']='Bearer '+admin
        return requests.request(method,base+path,headers=headers,json=data,timeout=30)
    def check(label,condition):
        nonlocal checks
        if not condition: raise AssertionError(label)
        checks+=1; print('PASS',label)
    try:
        for _ in range(2):
            email='knowledge-qa-'+uuid.uuid4().hex+'@example.test'; password=secrets.token_urlsafe(30)
            r=call('POST','/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True},privileged=True)
            if not r.ok: raise RuntimeError('Temporary QA creation failed')
            u={'id':r.json()['id']};users.append(u)
            r=call('POST','/auth/v1/token?grant_type=password',{'email':email,'password':password})
            if not r.ok: raise RuntimeError('Temporary QA sign-in failed')
            u['token']=r.json()['access_token']
        a,b=users
        for table in ['knowledge_items','knowledge_briefs','knowledge_runs','knowledge_job_state']:
            path='/rest/v1/'+table+'?limit=1'
            check('anonymous '+table+' denied',call('GET',path).status_code in (401,403))
            check('unapproved '+table+' empty',call('GET',path,token=a['token']).json()==[])
        check('self AI approval denied',call('PATCH','/rest/v1/beta_access?user_id=eq.'+a['id'],{'ai_approved':True},a['token']).status_code==403)
        check('service QA approval succeeds',call('PATCH','/rest/v1/beta_access?user_id=eq.'+a['id'],{'ai_approved':True},privileged=True).ok)
        for table in ['knowledge_items','knowledge_briefs','knowledge_runs']:
            path='/rest/v1/'+table+'?limit=1'
            r=call('GET',path,token=a['token'])
            check('approved existing '+table+' read',r.ok and len(r.json())==1)
            check('approved cannot mutate '+table,call('PATCH','/rest/v1/'+table+'?id=eq.'+r.json()[0]['id'],{},a['token']).status_code==403)
        audit=call('GET','/rest/v1/beta_audit?capability=eq.beta_access',token=a['token']).json()
        check('approval audit records change',len(audit)==2 and {r['action'] for r in audit}=={'INSERT','UPDATE'})
        check('other owner cannot read approval audit',call('GET','/rest/v1/beta_audit?owner_id=eq.'+a['id'],token=b['token']).json()==[])
        check('owner pauses account',call('PATCH','/rest/v1/beta_access?user_id=eq.'+a['id'],{'paused':True},a['token']).ok)
        check('paused reader no items',call('GET','/rest/v1/knowledge_items?limit=1',token=a['token']).json()==[])
        check('client cannot clear job pause',call('PATCH','/rest/v1/knowledge_job_state?id=eq.1',{'paused_reason':None,'paused_status':None},a['token']).status_code==403)
        claim='/rest/v1/rpc/claim_owned_knowledge_lease';release='/rest/v1/rpc/release_owned_knowledge_lease'
        check('client cannot claim job lease',call('POST',claim,{'_owner':owner,'_minutes':10},a['token']).status_code in (401,403,404))
        r=call('POST',claim,{'_owner':owner,'_minutes':1},privileged=True)
        check('service acquires free lease',r.ok and r.json() is True);held=True
        check('concurrent lease rejected',call('POST',claim,{'_owner':str(uuid.uuid4()),'_minutes':1},privileged=True).json() is False)
        check('wrong owner cannot release lease',call('POST',release,{'_owner':str(uuid.uuid4())},privileged=True).json() is False)
        check('right owner releases lease',call('POST',release,{'_owner':owner},privileged=True).json() is True);held=False
        print('RESULT',checks,'hosted knowledge and audit checks passed')
    finally:
        if held: call('POST','/rest/v1/rpc/release_owned_knowledge_lease',{'_owner':owner},privileged=True)
        for u in users:
            for table,field in [('beta_audit','owner_id'),('beta_access','user_id')]:
                if not call('DELETE','/rest/v1/'+table+'?'+field+'=eq.'+u['id'],privileged=True).ok: raise RuntimeError('QA record cleanup failed')
            if not call('DELETE','/auth/v1/admin/users/'+u['id'],privileged=True).ok: raise RuntimeError('QA account cleanup failed')
        print('Temporary knowledge QA records/accounts removed')

if __name__=='__main__':main()