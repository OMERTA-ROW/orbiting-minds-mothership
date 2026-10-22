"""Retained browser regression, explicit --run; no public release/provider actions."""
import asyncio,os,secrets,uuid,requests
from playwright.async_api import async_playwright
async def main():
 base=os.environ['SUPABASE_URL'];key=os.environ['SUPABASE_PUBLISHABLE_KEY'];admin=os.environ['SUPABASE_SERVICE_ROLE_KEY'];uid=None
 def call(method,path,data=None):
  h={'apikey':admin,'Content-Type':'application/json','Prefer':'return=representation'}
  if not admin.startswith('sb_'):h['Authorization']='Bearer '+admin
  return requests.request(method,base+path,json=data,headers=h,timeout=30)
 try:
  email='knowledge-browser-'+uuid.uuid4().hex+'@example.test';password=secrets.token_urlsafe(30)
  r=call('POST','/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True});assert r.ok;uid=r.json()['id']
  async with async_playwright() as p:
   browser=await p.chromium.launch(headless=True);page=await browser.new_page(viewport={'width':1280,'height':1800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080/auth',wait_until='networkidle')
   await page.get_by_label('Email',exact=True).fill(email);await page.get_by_label('Password',exact=True).fill(password)
   await page.get_by_role('button',name='Sign in',exact=True).click();await page.wait_for_url('**/beta')
   await page.goto('http://localhost:8080/knowledge-brief',wait_until='networkidle')
   await page.get_by_text('Your account is not approved or is paused.',exact=False).wait_for();print('PASS authenticated unapproved reader blocked')
   assert call('PATCH','/rest/v1/beta_access?user_id=eq.'+uid,{'ai_approved':True}).ok
   await page.reload(wait_until='networkidle')
   await page.get_by_role('region',name='Latest brief').get_by_role('heading',name='2026-10-22').wait_for()
   assert await page.get_by_role('region',name='Run history').get_by_text('completed',exact=True).count()>=1
   assert await page.get_by_role('region',name='Stored items').locator('li').count()>0
   await page.screenshot(path='/tmp/browser/knowledge-reader/approved-desktop.png')
   print('PASS approved brief citations and persisted runs read through UI')
   await page.set_viewport_size({'width':390,'height':1800});assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   await page.screenshot(path='/tmp/browser/knowledge-reader/approved-mobile.png')
   await page.get_by_role('button',name='Sign out',exact=True).click();await page.goto('http://localhost:8080/knowledge-brief',wait_until='networkidle');assert '/auth' in page.url
   print('PASS mobile fits and sign-out gates stored knowledge');assert not errors,errors
   await browser.close()
 finally:
  if uid:
   for table,field in [('beta_audit','owner_id'),('beta_access','user_id')]:assert call('DELETE','/rest/v1/'+table+'?'+field+'=eq.'+uid).ok
   assert call('DELETE','/auth/v1/admin/users/'+uid).ok
  print('Temporary reader account and audit removed')
if __name__ == "__main__":
 import sys
 if sys.argv[1:] != ["--run"]: raise SystemExit("Use --run for explicit preview QA.")
 asyncio.run(main())
