"""Opt-in private social draft QA, --run. No social account/API calls; removes QA records/accounts."""
import asyncio, json, os, secrets, sys, uuid
from pathlib import Path
import requests
from playwright.async_api import async_playwright

async def main():
    if sys.argv[1:] != ['--run']: raise SystemExit('Use --run for temporary authenticated draft QA.')
    base=os.environ['SUPABASE_URL']; key=os.environ['SUPABASE_PUBLISHABLE_KEY']; admin=os.environ['SUPABASE_SERVICE_ROLE_KEY']
    root=Path('/tmp/browser/omni-social'); root.mkdir(parents=True,exist_ok=True)
    users=[]; checks=0
    def call(method,path,data=None,token=None,privileged=False):
        credential=admin if privileged else key
        h={'apikey':credential,'Content-Type':'application/json','Prefer':'return=representation'}
        if token: h['Authorization']='Bearer '+token
        elif privileged and not admin.startswith('sb_'): h['Authorization']='Bearer '+admin
        return requests.request(method,base+path,json=data,headers=h,timeout=30)
    def check(label,value):
        nonlocal checks
        if not value: raise AssertionError(label)
        checks+=1;print('PASS',label)
    rpc='/rest/v1/rpc/omni_social_transition'
    try:
        for _ in range(2):
            email='social-qa-'+uuid.uuid4().hex+'@example.test'; password=secrets.token_urlsafe(30)
            r=call('POST','/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True},privileged=True)
            if not r.ok: raise RuntimeError('Temporary account creation failed')
            u={'id':r.json()['id'],'email':email,'password':password}; users.append(u)
            r=call('POST','/auth/v1/token?grant_type=password',{'email':email,'password':password})
            if not r.ok: raise RuntimeError('QA session unavailable')
            u['token']=r.json()['access_token']
        a,b=users
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True)
            context=await browser.new_context(viewport={'width':1280,'height':1800},accept_downloads=True,timezone_id='America/New_York')
            page=await context.new_page(); errors=[]; external=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda r:external.append(r.url) if any(h in r.url for h in ['api.linkedin.com','api.github.com','graph.facebook.com','open.tiktokapis.com','connector-gateway.lovable.dev']) else None)
            await page.goto('http://localhost:8080/auth',wait_until='networkidle')
            await page.get_by_label('Email',exact=True).fill(a['email']);await page.get_by_label('Password',exact=True).fill(a['password'])
            await page.get_by_role('button',name='Sign in',exact=True).click();await page.wait_for_url('**/beta')
            await page.get_by_label('Project name',exact=True).fill('Owner social QA')
            await page.get_by_label('Non-sensitive brief',exact=True).fill('Original private draft and exact developer-target proposal.')
            await page.get_by_role('button',name='Save private project').click();await page.get_by_role('heading',name='Owner social QA',exact=True).wait_for()
            ops=page.get_by_role('region',name='OMNI operations',exact=True)
            await ops.get_by_role('button',name='Social Autopilot',exact=True).click()
            social=ops.get_by_role('region',name='Social Autopilot',exact=True)
            await social.get_by_label('Social owned project').select_option(label='Owner social QA')
            for label,value in [('Declared account label','My test member declaration'),('Post title','  Original launch draft  '),('Rights and credits','Original text by creator; all rights declared'),('Post caption','One private original draft. No public posting authorized.'),('Post alt text','Text only; no image supplied'),('Hashtags','#original')]:
                await social.get_by_label(label,exact=True).fill(value)
            await social.get_by_label('Social target time UTC').fill('2026-11-01T12:00')
            await social.get_by_label('Social rights consent').check();await social.get_by_label('Social privacy consent').check()
            check('save requires exact consent',not await social.get_by_role('button',name='Save social draft',exact=True).is_enabled())
            await social.get_by_label('Save social consent').check();await social.get_by_role('button',name='Save social draft',exact=True).click()
            await social.get_by_text('DRAFT · revision 1 · NOT DELIVERED',exact=True).wait_for()
            check('real owned draft readback and UTC calendar',await social.get_by_text('2026-11-01 12:00:00 UTC',exact=True).count()==1)
            check('non-UTC browser preserves explicitly entered UTC intention',await social.get_by_label('Social target time UTC').input_value()=='2026-11-01T12:00')
            await social.get_by_label('Review social consent').check();await social.get_by_role('button',name='Review social draft',exact=True).click()
            await social.get_by_text('REVIEWED · revision 2 · NOT DELIVERED',exact=True).wait_for()
            check('human review never delivers',await social.get_by_text('Exact private plan reviewed. Publishing stays blocked.',exact=True).count()==1)
            await social.get_by_label('Post caption').fill('A changed caption requires a new exact review.')
            check('editing disables exact reviewed export',not await social.get_by_role('button',name='Export social plan').is_enabled())
            check('editing clears save consent',not await social.get_by_label('Save social consent').is_checked())
            await social.get_by_label('Save social consent').check();await social.get_by_role('button',name='Save social draft').click()
            await social.get_by_text('DRAFT · revision 3 · NOT DELIVERED',exact=True).wait_for()
            check('saved edit invalidates old review',await social.get_by_text('DRAFT · revision 3 · NOT DELIVERED',exact=True).count()==1)
            await page.reload(wait_until='networkidle');await ops.get_by_role('button',name='Social Autopilot',exact=True).click()
            await social.get_by_role('button',name='Load social plan',exact=True).click()
            check('draft readback survives reload',await social.get_by_label('Post caption').input_value()=='A changed caption requires a new exact review.')
            async with page.expect_download() as d: await social.get_by_role('button',name='Export social plan').click()
            await (await d.value).save_as(str(root/'plan.json'));v=json.loads((root/'plan.json').read_text())
            check('export has no job, account or receipt',v['scheduled'] is False and v['autopilot'] is False and v['receipt'] is None and v['account'] is None)
            await social.scroll_into_view_if_needed();await page.screenshot(path=str(root/'social-desktop.png'))
            await page.set_viewport_size({'width':390,'height':1800});await social.scroll_into_view_if_needed()
            await page.screenshot(path=str(root/'social-mobile.png'))
            check('social mobile fits',await page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            await social.get_by_role('button',name='Stop all plans',exact=True).click()
            await social.get_by_text('STOPPED · revision 4 · NOT DELIVERED',exact=True).wait_for()
            check('stop withdraws review without remote claims',not await social.get_by_role('button',name='Review social draft').is_enabled())
            await ops.get_by_role('button',name='Platform connectors',exact=True).click()
            catalog=ops.get_by_role('region',name='Platform readiness',exact=True)
            await catalog.get_by_label('Developer owned project').select_option(label='Owner social QA')
            await catalog.get_by_label('Developer target').fill('owner/selected-test-repository')
            await catalog.get_by_label('Developer workflow').fill('Read approved issue context first; propose a reviewed isolated test.')
            await catalog.get_by_label('Approve developer proposal').check()
            async with page.expect_download() as d: await catalog.get_by_role('button',name='Export developer proposal').click()
            await (await d.value).save_as(str(root/'dev.json'));v=json.loads((root/'dev.json').read_text())
            check('developer proposal grants no branch or execution',v['branch'] is None and v['testRun'] is None and v['deploy'] is False)
            await catalog.scroll_into_view_if_needed();await page.screenshot(path=str(root/'developer-mobile.png'))
            check('developer mobile fits',await page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            check('no browser runtime errors',not errors);check('zero social or developer API calls',not external)
            await page.get_by_role('button',name='Sign out',exact=True).click();await page.goto('http://localhost:8080/beta',wait_until='networkidle')
            check('signed out private beta blocked','/auth' in page.url)
            await browser.close()
        rows=call('GET','/rest/v1/omni_social_drafts',token=a['token']).json();row=rows[0];pid=row['project_id']
        check('second owner cannot read drafts',call('GET','/rest/v1/omni_social_drafts',token=b['token']).json()==[])
        check('anonymous read denied',call('GET','/rest/v1/omni_social_drafts').status_code in (401,403))
        check('second owner cannot stop another draft',call('POST',rpc,{'_action':'stop','_id':row['id'],'_revision':4},b['token']).status_code>=400)
        check('direct draft state forgery denied',call('PATCH','/rest/v1/omni_social_drafts?id=eq.'+row['id'],{'state':'REVIEWED'},a['token']).status_code==403)
        check('cross-project save denied',call('POST',rpc,{'_action':'save','_project':pid,'_content':row['content'],'_approve':True},b['token']).status_code>=400)
        check('publish action denied',call('POST',rpc,{'_action':'publish','_id':row['id'],'_revision':4,'_approve':True},a['token']).status_code>=400)
        check('stale revision denied',call('POST',rpc,{'_action':'stop','_id':row['id'],'_revision':1},a['token']).status_code>=400)
        check('missing consent denied',call('POST',rpc,{'_action':'save','_project':pid,'_content':row['content']},a['token']).status_code>=400)
        check('receipt field denied',call('POST',rpc,{'_action':'save','_project':pid,'_content':{**row['content'],'receipt':'fabricated'},'_approve':True},a['token']).status_code>=400)
        call('PATCH','/rest/v1/beta_access?user_id=eq.'+a['id'],{'paused':True},token=a['token'])
        check('paused save denied',call('POST',rpc,{'_action':'save','_project':pid,'_content':row['content'],'_approve':True},a['token']).status_code>=400)
        check('paused stop all remains available',call('POST',rpc,{'_action':'stop_all'},a['token']).ok)
        check('trigger-generated private audit',len(call('GET','/rest/v1/beta_audit?capability=eq.omni_social_drafts',token=a['token']).json())==4)
        check('other owner audit hidden',call('GET','/rest/v1/beta_audit?capability=eq.omni_social_drafts',token=b['token']).json()==[])
        print('RESULT',checks,'authenticated private social/developer planning checks passed')
    finally:
        for u in users:
            for table,field in [('omni_social_drafts','owner_id'),('beta_projects','owner_id'),('beta_audit','owner_id'),('beta_access','user_id')]:
                r=call('DELETE','/rest/v1/'+table+'?'+field+'=eq.'+u['id'],privileged=True)
                if not r.ok: print('QA cleanup failed',table,r.status_code)
            r=call('DELETE','/auth/v1/admin/users/'+u['id'],privileged=True)
            if not r.ok: print('QA account cleanup failed',r.status_code)
        print('Temporary social draft accounts and records removed')

asyncio.run(main())