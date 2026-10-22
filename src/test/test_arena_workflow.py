"""Retained browser regression, explicit --run; no public release/provider actions."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 Path('/tmp/browser/arena-check').mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080/arena',wait_until='networkidle')
  await page.evaluate("localStorage.setItem('evolution-arena-v1',JSON.stringify({points:10,history:[]}))")
  await page.reload(wait_until='networkidle')
  points=page.get_by_label('Local points',exact=True)
  assert await points.inner_text()=='10'
  await page.get_by_label('Replay seed').fill('42')
  await page.get_by_role('button',name='Replay',exact=True).click()
  assert await points.inner_text()=='10','Replay changed the balance'
  await page.get_by_text('Winner:',exact=False).wait_for()
  assert await points.inner_text()=='10'
  await page.screenshot(path='/tmp/browser/arena-check/replay-desktop.png')
  print('PASS replay never subtracts or awards points')
  await page.get_by_role('button',name='Start race',exact=True).click()
  assert await points.inner_text()=='10'
  assert await page.locator('aside li').count()==0,'Pending winner leaked in history'
  await page.get_by_text('Winner:',exact=False).wait_for()
  await page.wait_for_timeout(100)
  stored=await page.evaluate("JSON.parse(localStorage.getItem('evolution-arena-v1'))")
  assert len(stored['history'])==1
  assert stored['points']==10+stored['history'][0]['earned']
  standings=page.get_by_role('region',name='Local racer standings')
  assert await standings.get_by_role('row').count()==5
  assert sum(int(await cell.inner_text()) for cell in await standings.locator('tbody tr td:nth-child(2)').all())==1
  print('PASS finish awards once and persists one result')
  await page.reload(wait_until='networkidle');assert await points.inner_text()==str(stored['points'])
  await page.set_viewport_size({'width':390,'height':1800})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.screenshot(path='/tmp/browser/arena-check/mobile.png')
  await page.evaluate("localStorage.setItem('evolution-arena-v1',JSON.stringify({points:7,history:[null]}))")
  await page.reload(wait_until='networkidle');assert await points.inner_text()=='0'
  print('PASS corrupt local history fails safely; mobile fits')
  await page.evaluate("() => { Storage.prototype.setItem=function(){throw new Error('blocked storage')}; }")
  await page.emulate_media(reduced_motion='reduce')
  await page.get_by_role('button',name='Start race',exact=True).click()
  await page.get_by_text('Points could not be saved in this browser.',exact=False).wait_for()
  print('PASS storage failure reported without crashing')
  assert not errors,errors
  await browser.close()
if __name__ == "__main__":
 import sys
 if sys.argv[1:] != ["--run"]: raise SystemExit("Use --run for explicit preview QA.")
 asyncio.run(main())
