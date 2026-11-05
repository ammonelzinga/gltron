import {openHost,openPreferences,openAdvanced,openJoinPassword} from './landing-helpers.js';
import {test,expect} from '@playwright/test';

test.beforeEach(async({request})=>{
  for(const path of ['rooms','quickQueue'])await request.post('/__gltrof_local',{headers:{'x-gltrof-local':'1'},data:{action:'set',path,value:{}}});
});
test('two quick-match browsers pool and start automatically',async({context},info)=>{
  const pages=[await context.newPage(),await context.newPage()];
  for(const [i,p] of pages.entries()){
    await p.goto('/');await p.locator('#player-name').fill(`Pool ${i}`);
    await openPreferences(p);await p.locator('#quick-form [name=mode]').selectOption('classic');
    await openPreferences(p);await p.locator('#quick-form [name=required-mode]').check();
    await p.getByRole('button',{name:'Join quick match'}).click();
  }
  for(const p of pages){await expect(p.locator('#game')).toBeVisible({timeout:45000});await expect(p.locator('#game')).toBeVisible({timeout:35000});await expect(p.locator('#game-loading')).toBeHidden({timeout:35000});}
  const codes=await Promise.all(pages.map(p=>p.locator('#room-code').textContent()));expect(codes[0]).toBe(codes[1]);
  for(const p of pages)expect(await p.evaluate(()=>!!document.querySelector('#gltron-canvas').gameModule)).toBe(true);
  await pages[1].screenshot({path:`visual-review/pooled-${info.project.name}.png`});
});

test('required setting stays locked beyond ten seconds, cancellation removes queue entry',async({page})=>{
  await page.goto('/');await openPreferences(page);await page.locator('#quick-form [name=mode]').selectOption('snake');await openPreferences(page);await page.locator('#quick-form [name=required-mode]').check();
  await page.getByRole('button',{name:'Join quick match'}).click();
  await expect(page.locator('#quick-status')).toContainText('closest game',{timeout:15000});
  await expect(page.locator('#landing')).toBeVisible();
  const entry=await page.evaluate(async()=>{const s=window.__gltrof;return(await s.store.get('quickQueue')).entries[s.browserId];});
  expect(entry.required.mode).toBe(true);
  await page.getByRole('button',{name:'Cancel search'}).click();
  await expect(page.locator('#quick-status')).toContainText('cancelled');
  await expect.poll(()=>page.evaluate(async()=>{const s=window.__gltrof;return Boolean((await s.store.get('quickQueue'))?.entries?.[s.browserId]);})).toBe(false);
});

test('after ten seconds soft preferences join a completely different available game',async({context})=>{
  const host=await context.newPage(),guest=await context.newPage();
  await host.goto('/');await openHost(host);await host.locator('#create-form [name=lobbyName]').fill('Fallback room');
  await host.locator('#create-form [name=gridSize]').selectOption('240');await host.locator('#create-form [name=speed]').selectOption('6');
  await host.getByRole('button',{name:'Create lobby'}).click();await expect(host.locator('#lobby')).toBeVisible();
  const code=await host.locator('#room-code').textContent();
  await guest.goto('/');await openPreferences(guest);await guest.locator('#quick-form [name=gridSize]').selectOption('960');await openPreferences(guest);await guest.locator('#quick-form [name=mode]').selectOption('snake');await openPreferences(guest);await guest.locator('#quick-form [name=speed]').selectOption('14');
  const start=Date.now();await guest.getByRole('button',{name:'Join quick match'}).click();
  await expect(guest.locator('#lobby')).toBeVisible({timeout:20000});expect(Date.now()-start).toBeGreaterThanOrEqual(9500);
  await expect(guest.locator('#room-code')).toHaveText(code);await expect(host.locator('#player-list .player')).toHaveCount(2);
});
