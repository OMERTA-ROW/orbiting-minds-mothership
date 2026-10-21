"""Opt-in authenticated Forge radio/web + hosted isolation regression: --run.
Creates temporary QA accounts only; reads environment credentials without logging.
All accounts, Forge checkpoints and private media are removed in finally.
"""
import asyncio
import io
import json
import math
import os
from pathlib import Path
import secrets
import sys
import uuid
import wave
import requests
from playwright.async_api import async_playwright

async def main():
    if sys.argv[1:] != ['--run']:
        raise SystemExit('Use --run for temporary authenticated QA.')
    base = os.environ['SUPABASE_URL']
    key = os.environ['SUPABASE_PUBLISHABLE_KEY']
    admin = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    root = Path('/tmp/browser/forge')
    root.mkdir(parents=True, exist_ok=True)
    users = []
    checks = 0
    def call(method, path, data=None, token=None, privileged=False):
        credential = admin if privileged else key
        headers = {'apikey': credential, 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
        if token: headers['Authorization'] = 'Bearer ' + token
        elif privileged and not admin.startswith('sb_'): headers['Authorization'] = 'Bearer ' + admin
        return requests.request(method, base + path, headers=headers, json=data, timeout=30)
    def check(label, condition):
        nonlocal checks
        if not condition: raise AssertionError(label)
        checks += 1
        print('PASS', label)
    try:
        for _ in range(2):
            email = 'forge-qa-' + uuid.uuid4().hex + '@example.test'
            password = secrets.token_urlsafe(30)
            created = call('POST', '/auth/v1/admin/users', {'email': email, 'password': password, 'email_confirm': True}, privileged=True)
            if not created.ok: raise RuntimeError('Temporary QA account creation failed')
            user = {'id': created.json()['id'], 'email': email, 'password': password}
            users.append(user)
            session = call('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': password})
            if not session.ok: raise RuntimeError('Temporary QA session failed')
            user['token'] = session.json()['access_token']
        a,b = users
        check('self studio approval blocked', call('PATCH', '/rest/v1/beta_access?user_id=eq.'+a['id'], {'studio_approved': True}, a['token']).status_code >= 400)
        for user in users:
            if not call('PATCH', '/rest/v1/beta_access?user_id=eq.'+user['id'], {'studio_approved': True}, privileged=True).ok: raise RuntimeError('Temporary QA approval failed')
        samples = [round(2000*math.sin(2*math.pi*220*i/8000)) for i in range(8000)]
        with wave.open(str(root/'source.wav'), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
            w.writeframes(b''.join(v.to_bytes(2,'little',signed=True) for v in samples))
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={'width':1280,'height':1800}, accept_downloads=True)
            page = await context.new_page()
            errors=[]
            page.on('pageerror', lambda e: errors.append(str(e)))
            await page.goto('http://localhost:8080/auth', wait_until='networkidle')
            await page.get_by_label('Email', exact=True).fill(a['email'])
            await page.get_by_label('Password', exact=True).fill(a['password'])
            await page.get_by_role('button',name='Sign in',exact=True).click()
            await page.wait_for_url('**/beta')
            await page.get_by_label('Project name',exact=True).fill('Original release Forge QA')
            await page.get_by_label('Non-sensitive brief').fill('Rights-cleared synthetic tone and original reviewable website.')
            await page.get_by_role('button',name='Save private project').click()
            await page.get_by_role('heading',name='Original release Forge QA').wait_for()
            await page.get_by_role('link',name='Quantum Studio',exact=True).click()
            await page.get_by_role('heading',name='OMNI FORGE',exact=True).wait_for()
            await page.get_by_label('Media rights consent').check()
            await page.get_by_label('Private file permission').check()
            await page.get_by_label('Upload private WAV').set_input_files(str(root/'source.wav'))
            await page.get_by_role('button',name='Inspect source',exact=True).wait_for()
            await page.get_by_role('button',name='Inspect source',exact=True).click()
            await page.get_by_label('Original audio',exact=True).wait_for()
            await page.get_by_label('Media rights consent').check()
            await page.get_by_label('Private file permission').check()
            forge = page.get_by_role('region',name='OMNI FORGE',exact=True)
            await forge.get_by_label('Cue start seconds').fill('0.1')
            await forge.get_by_label('Cue end seconds').fill('0.2')
            await forge.get_by_label('Radio fade milliseconds').fill('0')
            check('manual cue review gate', not await forge.get_by_role('button',name='Add reviewed cue').is_enabled())
            await forge.get_by_label('Manually reviewed cue').check()
            await forge.get_by_role('button',name='Add reviewed cue').click()
            check('radio process gate', not await forge.get_by_role('button',name='Create radio version').is_enabled())
            await forge.get_by_label('Approve radio processing').check()
            await forge.get_by_role('button',name='Create radio version').click()
            await forge.get_by_role('button',name='Create radio version').wait_for(); await page.wait_for_timeout(2000); print('RADIO STATUS',await forge.get_by_role('status').all_text_contents()); await forge.screenshot(path=str(root/'radio-result.png'))
            await forge.get_by_text('Radio · revision 1',exact=True).wait_for(timeout=30000)
            await forge.get_by_role('button',name='Load version',exact=True).click()
            await forge.get_by_label('Forge edited audio',exact=True).wait_for()
            check('radio before after playback loaded', await page.get_by_label('Forge edited audio').evaluate('(a)=>!!a.src') and await page.get_by_label('Forge original audio').evaluate('(a)=>!!a.src'))
            await forge.scroll_into_view_if_needed()
            await page.screenshot(path=str(root/'radio-reviewed.png'))
            await forge.get_by_label('Review Forge export').check()
            await forge.get_by_role('button',name='Record owner review').click()
            await forge.get_by_text('OWNER EXPORT REVIEW RECORDED',exact=False).wait_for()
            async with page.expect_download() as d:
                await forge.get_by_role('button',name='Export saved radio').click()
            radio_download=await d.value
            await radio_download.save_as(str(root/'radio.wav'))
            with wave.open(str(root/'radio.wav'),'rb') as w:
                output=w.readframes(w.getnframes()); frames=w.getnframes()
            actual=[int.from_bytes(output[i:i+2],'little',signed=True) for i in range(0,len(output),2)]
            check('download contains exact requested silence frames', frames==8000 and actual[:800]==samples[:800] and actual[800:1600]==[0]*800 and actual[1600:]==samples[1600:])
            await forge.get_by_role('button',name='Web Forge',exact=True).click()
            await forge.get_by_label('Web brand',exact=True).fill('Original Signal')
            await forge.get_by_label('Web headline').fill('A creator-owned release')
            await forge.get_by_label('Web description').fill('Original Signal shares a rights-cleared release and its creator story.')
            await forge.get_by_label('Web about').fill('This is an original artist release. Every source remains private until reviewed.')
            await forge.get_by_label('Web credits').fill('Original Signal — creator-owned work; synthetic QA tone.')
            asset_rows=call('GET','/rest/v1/studio_assets?owner_id=eq.'+a['id'],token=a['token']).json()
            edited=next(r for r in asset_rows if r['role']=='enhanced')
            await forge.get_by_label('Web shared audio').select_option(edited['id'])
            preview=page.frame_locator('iframe[title="Web Forge preview"]')
            check('actual web preview renders edited brand',await preview.get_by_role('heading',name='Original Signal',exact=True).count()==1)
            await forge.get_by_role('button',name='Save new web version').click()
            await forge.get_by_text('Web · revision 1',exact=True).wait_for(timeout=30000)
            await forge.get_by_label('Review Forge export').check()
            await forge.get_by_role('button',name='Record owner review').click()
            await forge.get_by_role('button',name='Withdraw review').wait_for()
            await forge.get_by_label('Web brand',exact=True).fill('Changed Signal')
            check('editing invalidates saved web export gate',not await forge.get_by_role('button',name='Export saved web').is_enabled())
            await forge.get_by_role('button',name='Restore saved draft').click()
            check('restore returns exact saved brand',await forge.get_by_label('Web brand').input_value()=='Original Signal')
            await forge.get_by_label('Review Forge export').check()
            async with page.expect_download() as d:
                await forge.get_by_role('button',name='Export saved web').click()
            doc=await d.value
            await doc.save_as(str(root/'website.html'))
            text=(root/'website.html').read_text()
            check('export is real self-contained html without private media', '<!doctype html>' in text and '<h1>Original Signal</h1>' in text and edited['id'] not in text and '<script' not in text)
            await forge.get_by_label('Web brand',exact=True).fill('Signal Revision Two')
            await forge.get_by_role('button',name='Save new web version').click()
            await forge.get_by_text('Web · revision 2',exact=True).wait_for()
            check('new web revision starts unreviewed', await forge.get_by_role('button',name='Record owner review').count()==1)
            await page.reload(wait_until='networkidle')
            forge=page.get_by_role('region',name='OMNI FORGE',exact=True)
            check('saved versions persist through reload', await forge.get_by_text('Web · revision 2',exact=True).count()==1 and await forge.get_by_text('Radio · revision 1',exact=True).count()==1)
            await forge.get_by_role('button',name='Load version').first.click()
            check('saved draft reads back through UI',await forge.get_by_label('Web brand').input_value()=='Signal Revision Two')
            await forge.scroll_into_view_if_needed()
            await page.screenshot(path=str(root/'web-desktop.png'))
            await page.set_viewport_size({'width':390,'height':1800})
            await forge.scroll_into_view_if_needed()
            await page.screenshot(path=str(root/'web-mobile.png'))
            await page.get_by_title('Web Forge preview',exact=True).scroll_into_view_if_needed(); await page.wait_for_timeout(500); await page.get_by_title('Web Forge preview',exact=True).screenshot(path=str(root/'web-mobile-preview.png'))
            check('mobile outer page has no horizontal overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            check('mobile drafted website has no horizontal overflow',await preview.locator('html').evaluate('(e)=>e.scrollWidth<=e.clientWidth'))
            await page.set_viewport_size({'width':1280,'height':1800})
            await forge.get_by_role('link',name='Ask OMNI',exact=True).click()
            await page.get_by_role('heading',name='OMNI',exact=True).wait_for()
            check('OMNI text handoff does not send inference or media', 'Propose a rights-cleared' in await page.get_by_role('textbox',name='Message OMNI',exact=False).input_value() and not await page.get_by_role('button',name='Send to OMNI',exact=True).is_enabled())
            await page.goto('http://localhost:8080/quantum-studio',wait_until='networkidle')
            await page.get_by_role('button',name='Sign out',exact=True).click()
            await page.wait_for_url('**/auth')
            await page.goto('http://localhost:8080/quantum-studio',wait_until='networkidle')
            check('signed out studio is gated',page.url.endswith('/auth'))
            check('browser no runtime errors',errors==[])
            await browser.close()
        versions=call('GET','/rest/v1/forge_versions?owner_id=eq.'+a['id'],token=a['token']).json()
        version=next(v for v in versions if v['kind']=='web')
        check('cross owner versions hidden',call('GET','/rest/v1/forge_versions',token=b['token']).json()==[])
        check('anonymous version read denied',call('GET','/rest/v1/forge_versions').status_code>=400)
        check('forged bearer denied',call('GET','/rest/v1/forge_versions',token='invalid-token').status_code>=400)
        forged={k:version[k] for k in ['owner_id','project_id','kind','revision','content','sha256','evidence','processor']}
        check('client cannot forge output evidence',call('POST','/rest/v1/forge_versions',forged,a['token']).status_code>=400)
        check('client cannot alter output digest',call('PATCH','/rest/v1/forge_versions?id=eq.'+version['id'],{'sha256':'a'*64},a['token']).status_code>=400)
        review={'version_id':version['id'],'sha256':version['sha256'],'rights_consent':True,'privacy_consent':True,'export_approved':True}
        check('cross owner review denied',call('POST','/rest/v1/forge_reviews',review,b['token']).status_code>=400)
        check('wrong digest review denied',call('POST','/rest/v1/forge_reviews',{**review,'sha256':'a'*64},a['token']).status_code>=400)
        call('PATCH','/rest/v1/beta_access?user_id=eq.'+a['id'],{'paused':True},a['token'])
        check('paused export review denied',call('POST','/rest/v1/forge_reviews',review,a['token']).status_code>=400)
        check('paused account can recover saved versions',len(call('GET','/rest/v1/forge_versions',token=a['token']).json())==3)
        check('cross owner reviews hidden',call('GET','/rest/v1/forge_reviews',token=b['token']).json()==[])
        radio_version=next(v for v in versions if v['kind']=='radio')
        path=a['id']+'/'+radio_version['output_id']+'/audio.wav'
        call('DELETE','/storage/v1/object/quantum-studio',{'prefixes':[path]},a['token'])
        check('linked radio storage cannot be deleted by client',call('GET','/storage/v1/object/quantum-studio/'+path,token=a['token']).ok)
        audit=call('GET','/rest/v1/beta_audit?capability=in.(forge_versions,forge_reviews)',token=a['token']).json()
        check('Forge private changes generate audit',len(audit)>=5)
        print('RESULT',checks,'authenticated Forge and privacy checks passed')
    finally:
        for user in users:
            if not call('DELETE','/rest/v1/forge_versions?owner_id=eq.'+user['id'],privileged=True).ok: raise RuntimeError('Forge checkpoint cleanup failed')
            assets=call('GET','/rest/v1/studio_assets?owner_id=eq.'+user['id'],privileged=True).json()
            if assets:
                paths=[user['id']+'/'+a['id']+'/audio.wav' for a in assets]
                if not call('DELETE','/storage/v1/object/quantum-studio',{'prefixes':paths},privileged=True).ok: raise RuntimeError('QA media cleanup failed')
            for role in ['enhanced','original']:
                if not call('DELETE','/rest/v1/studio_assets?owner_id=eq.'+user['id']+'&role=eq.'+role,privileged=True).ok: raise RuntimeError('QA asset cleanup failed')
            for table,field in [('beta_projects','owner_id'),('beta_audit','owner_id'),('beta_access','user_id')]:
                if not call('DELETE','/rest/v1/'+table+'?'+field+'=eq.'+user['id'],privileged=True).ok: raise RuntimeError('QA data cleanup failed')
            if not call('DELETE','/auth/v1/admin/users/'+user['id'],privileged=True).ok: raise RuntimeError('QA account cleanup failed')
        print('Temporary Forge accounts, approvals and files removed')

if __name__=='__main__':
    asyncio.run(main())
