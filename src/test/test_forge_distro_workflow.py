"""Opt-in temporary authenticated Creator/Distro QA, --run. No external uploads.
Reads credentials without output; removes private versions, files and accounts in finally.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
import uuid
import zipfile
import xml.etree.ElementTree as ET
import requests
from playwright.async_api import async_playwright

async def main():
    if sys.argv[1:] != ['--run']:
        raise SystemExit('Use --run for temporary private QA.')
    base = os.environ['SUPABASE_URL']
    key = os.environ['SUPABASE_PUBLISHABLE_KEY']
    admin = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    root = Path('/tmp/browser/forge-distro')
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
            email = 'creator-qa-' + uuid.uuid4().hex + '@example.test'
            password = secrets.token_urlsafe(30)
            created = call('POST', '/auth/v1/admin/users', {'email': email, 'password': password, 'email_confirm': True}, privileged=True)
            if not created.ok: raise RuntimeError('Temporary QA account creation failed')
            user = {'id': created.json()['id'], 'email': email, 'password': password}
            users.append(user)
            session = call('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': password})
            if not session.ok: raise RuntimeError('Temporary QA session failed')
            user['token'] = session.json()['access_token']
        a, b = users
        for u in users:
            if not call('PATCH', '/rest/v1/beta_access?user_id=eq.'+u['id'], {'studio_approved': True}, privileged=True).ok:
                raise RuntimeError('Temporary QA approval failed')
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={'width':1280, 'height':1800}, accept_downloads=True)
            page = await context.new_page()
            errors=[]
            page.on('pageerror', lambda e: errors.append(str(e)))
            await page.goto('http://localhost:8080/auth', wait_until='networkidle')
            await page.get_by_label('Email',exact=True).fill(a['email'])
            await page.get_by_label('Password',exact=True).fill(a['password'])
            await page.get_by_role('button',name='Sign in',exact=True).click()
            await page.wait_for_url('**/beta')
            await page.get_by_label('Project name',exact=True).fill('Original Creator Distro QA')
            await page.get_by_label('Non-sensitive brief').fill('Original fictional canon and consented synthetic WAV release.')
            await page.get_by_role('button',name='Save private project').click()
            await page.get_by_role('heading',name='Original Creator Distro QA').wait_for()
            await page.get_by_role('link',name='Quantum Studio',exact=True).click()
            await page.get_by_role('region',name='Creator Universe and Distro').wait_for()
            await page.get_by_label('Media rights consent').check()
            await page.get_by_label('Private file permission').check()
            import wave
            pcm=[1000,-1000]*4000
            with wave.open(str(root/'source.wav'),'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
                w.writeframes(b''.join(v.to_bytes(2,'little',signed=True) for v in pcm))
            await page.get_by_label('Upload private WAV').set_input_files(str(root/'source.wav'))
            await page.get_by_role('button',name='Inspect source',exact=True).wait_for()
            await page.get_by_role('button',name='Inspect source',exact=True).click()
            await page.get_by_label('Media rights consent').check()
            await page.get_by_label('Private file permission').check()
            await page.get_by_label('Approve enhancement',exact=True).check()
            await page.get_by_role('button',name='Create enhanced version',exact=True).click()
            await page.get_by_label('Enhanced audio',exact=True).wait_for(timeout=30000)
            check('real non-destructive enhancement reads back',await page.get_by_label('Enhanced audio').evaluate('(a)=>!!a.src'))
            creator=page.get_by_role('region',name='Creator Universe and Distro')
            await creator.get_by_label('Universe name',exact=True).fill('Lantern Atlas Original QA')
            await creator.get_by_label('Rights provenance',exact=True).fill('Original fictional QA example; generated synthetic test tone, no guest or real voice.')
            await creator.get_by_role('button',name='Save canon version').click()
            await creator.get_by_role('heading',name='Lantern Atlas Original QA',exact=True).wait_for()
            check('canon saved readback',await creator.get_by_role('button',name='Load canon').count()==1)
            await creator.scroll_into_view_if_needed()
            await page.screenshot(path=str(root/'canon-desktop.png'))
            await creator.get_by_role('tab',name='OMNI FORGE DISTRO',exact=True).click()
            check('RSS refuses missing private source and owned destination',not await creator.get_by_role('button',name='Save release draft').is_enabled())
            versions=call('GET','/rest/v1/forge_creator_versions?owner_id=eq.'+a['id'],token=a['token']).json()
            canon=next(v for v in versions if v['kind']=='canon')
            assets=call('GET','/rest/v1/studio_assets?owner_id=eq.'+a['id'],token=a['token']).json()
            audio=next(v for v in assets if v['role']=='enhanced')
            await creator.get_by_label('Release title',exact=True).fill('Episode One & Lanterns')
            await creator.get_by_label('Shared canon',exact=True).select_option(canon['id'])
            await creator.get_by_label('Distro private WAV',exact=True).select_option(audio['id'])
            await creator.get_by_label('Owned-site directory',exact=True).fill('h')
            check('partial URL typing stays safe and blocks save',not await creator.get_by_role('button',name='Save release draft').is_enabled())
            await creator.get_by_label('Owned-site directory',exact=True).fill('https://creator-controlled.net/podcast')
            await creator.get_by_role('button',name='Save release draft').click()
            await creator.get_by_role('button',name='Load release',exact=True).wait_for()
            check('new draft cannot export',not await creator.get_by_role('button',name='Prepare manual bundle').is_enabled())
            await creator.get_by_label('Approve Distro export',exact=True).check()
            check('first RSS review requires owned-site confirmation',not await creator.get_by_role('button',name='Review release',exact=True).is_enabled())
            await creator.get_by_label('Confirm owned site',exact=True).check()
            await creator.get_by_role('button',name='Review release',exact=True).click()
            await creator.get_by_text('REVIEWED · exact version 1',exact=True).wait_for()
            try:
                async with page.expect_download() as d:
                    await creator.get_by_role('button',name='Prepare manual bundle').click()
            except Exception:
                await creator.scroll_into_view_if_needed()
                await page.screenshot(path=str(root/'export-failed.png'))
                print('Export status:', await creator.get_by_role('status').all_text_contents())
                raise
            await (await d.value).save_as(str(root/'bundle.zip'))
            with zipfile.ZipFile(root/'bundle.zip') as z:
                feed=z.read('feed.xml'); manifest=json.loads(z.read('release.json')); canon_export=json.loads(z.read('canon.json'))
                check('bundle contains real RSS private WAV and canon',len(z.namelist())==5 and canon_export['content']['name']=='Lantern Atlas Original QA')
                item=ET.fromstring(feed).find('channel/item')
                enclosure=item.find('enclosure')
                expected_url='https://creator-controlled.net/podcast/audio/'+manifest['releaseId']+'.wav'
                check('RSS enclosure matches declared site and exact exported file',enclosure.attrib['url']==expected_url and enclosure.attrib['type']=='audio/wav')
                exported=z.read('audio/'+manifest['releaseId']+'.wav')
                check('RSS enclosure byte length validated',int(enclosure.attrib['length'])==len(exported)==audio['byte_size'])
                check('WAV digest matches saved output',hashlib.sha256(exported).hexdigest()==audio['sha256'])
                check('metadata never invents delivered receipt or scheduling',manifest['receipt'] is None and manifest['scheduled'] is False and manifest['autopublish'] is False and manifest['delivery']=='MANUAL EXPORT / NOT UPLOADED')
                check('RSS escaping roundtrips exact title',item.findtext('title')=='Episode One & Lanterns')
            async with page.expect_download() as d:
                await creator.get_by_role('button',name='Prepare manual bundle').click()
            await (await d.value).save_as(str(root/'bundle-repeat.zip'))
            check('repeat preparation is byte-identical', (root/'bundle.zip').read_bytes()==(root/'bundle-repeat.zip').read_bytes())
            await creator.get_by_label('Release title',exact=True).fill('Changed not reviewed')
            check('edited draft invalidates export',not await creator.get_by_role('button',name='Prepare manual bundle').is_enabled())
            await creator.get_by_role('button',name='Restore saved release').click()
            await creator.get_by_label('Approve Distro export',exact=True).check()
            await creator.get_by_label('Confirm owned site',exact=True).check()
            await creator.scroll_into_view_if_needed()
            await page.screenshot(path=str(root/'distro-desktop.png'))
            await page.set_viewport_size({'width':390,'height':1800})
            await creator.scroll_into_view_if_needed()
            await page.wait_for_timeout(300)
            await page.screenshot(path=str(root/'distro-mobile.png'))
            check('mobile no horizontal overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            await page.reload(wait_until='networkidle')
            creator=page.get_by_role('region',name='Creator Universe and Distro')
            await page.get_by_label('Media rights consent').check()
            await page.get_by_label('Private file permission').check()
            await creator.get_by_role('tab',name='OMNI FORGE DISTRO',exact=True).click()
            await creator.get_by_role('button',name='Load release',exact=True).click()
            check('release readback survives reload',await creator.get_by_label('Release title',exact=True).input_value()=='Episode One & Lanterns')
            check('review persisted exact version',await creator.get_by_text('BUNDLE_PREPARED · exact version 1',exact=True).count()==1)
            await creator.get_by_role('button',name='Revoke release',exact=True).click()
            await creator.get_by_text('REVOKED · exact version 1',exact=True).wait_for()
            check('revocation blocks future UI exports',not await creator.get_by_role('button',name='Prepare manual bundle').is_enabled())
            await creator.get_by_label('Release channel',exact=True).select_option('game')
            await creator.get_by_label('Release title',exact=True).fill('Lantern Atlas Game Plan')
            await creator.get_by_role('button',name='Save release draft').click()
            await creator.get_by_text('DRAFT · exact version 2',exact=True).wait_for()
            await creator.get_by_label('Approve Distro export',exact=True).check()
            await creator.get_by_role('button',name='Review release',exact=True).click()
            await creator.get_by_text('REVIEWED · exact version 2',exact=True).wait_for()
            async with page.expect_download() as d:
                await creator.get_by_role('button',name='Prepare manual bundle').click()
            await (await d.value).save_as(str(root/'game-plan.zip'))
            with zipfile.ZipFile(root/'game-plan.zip') as z:
                m=json.loads(z.read('release.json'))
                check('game plan export never invents builds or copies audio',set(z.namelist())=={'release.json','canon.json','HANDOFF.txt'} and m['mediaIncluded'] is False and m['receipt'] is None)
            await creator.get_by_label('Release title',exact=True).fill('Episode One & Lanterns')
            await creator.get_by_role('link',name='Ask OMNI',exact=True).click()
            await page.get_by_role('heading',name='OMNI',exact=True).wait_for()
            check('OMNI handoff stays draft without inference', 'Episode One' in await page.get_by_role('textbox',name='Message OMNI',exact=False).input_value() and not await page.get_by_role('button',name='Send to OMNI',exact=True).is_enabled())
            await page.get_by_role('button',name='Sign out',exact=True).click()
            await page.wait_for_url('**/auth')
            await page.goto('http://localhost:8080/quantum-studio',wait_until='networkidle')
            check('signed out cannot read Creator Distro',page.url.endswith('/auth'))
            check('zero browser runtime errors',errors==[])
            await browser.close()
        versions=call('GET','/rest/v1/forge_creator_versions?owner_id=eq.'+a['id'],token=a['token']).json()
        release=next(v for v in versions if v['kind']=='release' and v['state']=='REVOKED')
        game=next(v for v in versions if v['kind']=='release' and v['state']=='BUNDLE_PREPARED')
        args={'_id':release['id'],'_sha256':release['sha256'],'_action':'prepare','_rights':True,'_privacy':True,'_approve':True,'_owned_site':True}
        check('revoked direct RPC refuses preparation',call('POST','/rest/v1/rpc/forge_release_transition',args,a['token']).status_code>=400)
        check('second owner cannot read drafts',call('GET','/rest/v1/forge_creator_versions',token=b['token']).json()==[])
        check('second owner cannot operate release',call('POST','/rest/v1/rpc/forge_release_transition',{**args,'_action':'revoke'},b['token']).status_code>=400)
        check('anonymous draft read refused',call('GET','/rest/v1/forge_creator_versions').status_code>=400)
        check('anonymous RPC refused',call('POST','/rest/v1/rpc/forge_release_transition',args).status_code>=400)
        check('client cannot change release digest',call('PATCH','/rest/v1/forge_creator_versions?id=eq.'+release['id'],{'sha256':'a'*64},a['token']).status_code>=400)
        check('client cannot insert fake reviewed release',call('POST','/rest/v1/forge_creator_versions',{'owner_id':a['id'],'project_id':release['project_id'],'kind':'release','content':release['content'],'sha256':release['sha256'],'state':'REVIEWED'},a['token']).status_code>=400)
        check('wrong digest refuses action',call('POST','/rest/v1/rpc/forge_release_transition',{**args,'_action':'revoke','_sha256':'a'*64},a['token']).status_code>=400)
        path=a['id']+'/'+audio['id']+'/audio.wav'
        call('DELETE','/storage/v1/object/quantum-studio',{'prefixes':[path]},a['token'])
        check('release retains source audio after revoke',call('GET','/storage/v1/object/quantum-studio/'+path,token=a['token']).ok)
        audit=call('GET','/rest/v1/beta_audit?capability=eq.forge_creator_versions',token=a['token']).json()
        check('version and review changes audited',len(audit)==8)
        check('repeat export creates no duplicate transition',sum(e['action']=='UPDATE' for e in audit)==5)
        # Immutable draft, paused/revoked access and source-project guards exercised without external services.
        clone={k:release[k] for k in ['owner_id','project_id','kind','content','sha256','asset_id','canon_id']}
        new=call('POST','/rest/v1/forge_creator_versions',clone,privileged=True)
        if not new.ok: raise RuntimeError('Temporary draft for access checks failed')
        fresh=new.json()[0]
        args={**args,'_id':fresh['id']}
        check('RPC draft prepare gate',call('POST','/rest/v1/rpc/forge_release_transition',args,a['token']).status_code>=400)
        check('RPC consent gate',call('POST','/rest/v1/rpc/forge_release_transition',{**args,'_action':'review','_rights':False},a['token']).status_code>=400)
        call('PATCH','/rest/v1/beta_access?user_id=eq.'+a['id'],{'paused':True},a['token'])
        check('paused review rejected',call('POST','/rest/v1/rpc/forge_release_transition',{**args,'_action':'review'},a['token']).status_code>=400)
        check('paused preparation of reviewed version rejected',call('POST','/rest/v1/rpc/forge_release_transition',{**args,'_id':game['id'],'_sha256':game['sha256'],'_action':'prepare'},a['token']).status_code>=400)
        check('pause does not block withdrawal',call('POST','/rest/v1/rpc/forge_release_transition',{**args,'_action':'revoke'},a['token']).ok)
        check('paused account can recover own records',len(call('GET','/rest/v1/forge_creator_versions',token=a['token']).json())==4)
        call('PATCH','/rest/v1/beta_access?user_id=eq.'+a['id'],{'paused':False},a['token'])
        call('PATCH','/rest/v1/beta_access?user_id=eq.'+a['id'],{'studio_approved':False},privileged=True)
        check('withdrawn media approval blocks reviewed preparation',call('POST','/rest/v1/rpc/forge_release_transition',{**args,'_id':game['id'],'_sha256':game['sha256'],'_action':'prepare'},a['token']).status_code>=400)
        print('RESULT',checks,'authenticated Creator Distro checks passed')
    finally:
        for u in users:
            for kind in ['release','canon']:
                if not call('DELETE','/rest/v1/forge_creator_versions?owner_id=eq.'+u['id']+'&kind=eq.'+kind,privileged=True).ok: raise RuntimeError('Creator version cleanup failed')
            if not call('DELETE','/rest/v1/forge_versions?owner_id=eq.'+u['id'],privileged=True).ok: raise RuntimeError('Forge cleanup failed')
            assets=call('GET','/rest/v1/studio_assets?owner_id=eq.'+u['id'],privileged=True).json()
            if assets:
                if not call('DELETE','/storage/v1/object/quantum-studio',{'prefixes':[u['id']+'/'+v['id']+'/audio.wav' for v in assets]},privileged=True).ok: raise RuntimeError('QA media cleanup failed')
            for role in ['enhanced','original']:
                if not call('DELETE','/rest/v1/studio_assets?owner_id=eq.'+u['id']+'&role=eq.'+role,privileged=True).ok: raise RuntimeError('QA asset cleanup failed')
            for table,field in [('beta_projects','owner_id'),('beta_audit','owner_id'),('beta_access','user_id')]:
                if not call('DELETE','/rest/v1/'+table+'?'+field+'=eq.'+u['id'],privileged=True).ok: raise RuntimeError('QA record cleanup failed')
            if not call('DELETE','/auth/v1/admin/users/'+u['id'],privileged=True).ok: raise RuntimeError('QA account cleanup failed')
        print('Temporary Creator Distro accounts, files and approvals removed')

if __name__=='__main__':
    asyncio.run(main())