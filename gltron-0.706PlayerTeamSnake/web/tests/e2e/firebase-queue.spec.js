import {test,expect,chromium} from '@playwright/test';
test.skip(!process.env.GLTROF_AUTH_EMULATOR,'Local Firebase emulator test config required.');
test.beforeEach(async()=>{
  // This reset is deliberately limited to a local demo emulator, never production.
  for(const [path,value] of [['quickQueue',{revision:237}],['rooms',null]]){
    const response=await fetch('http://127.0.0.1:9000/'+path+'.json?ns=demo-gltrof-default-rtdb',{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(value)});expect(response.ok).toBe(true);
  }
});
async function ready(page){await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__gltrof?.store?.mode)).toBe('firebase');expect(await page.evaluate(()=>window.__gltrof.store.auth.emulatorConfig?.host)).toBe('127.0.0.1');}
async function loaded(page){
  await expect(page.locator('#game')).toBeVisible({timeout:45000});await expect(page.locator('#game-loading')).toBeHidden({timeout:35000});
  const position=()=>page.evaluate(()=>[0,1].map(axis=>window.__gltrof.module.ccall('web_player_position','number',['number','number'],[0,axis])));
  const before=await position();await expect.poll(async()=>{const after=await position();return Math.hypot(after[0]-before[0],after[1]-before[1]);},{timeout:15000}).toBeGreaterThan(.2);
}
test('Chrome plus Edge survive a cold nonzero queue revision; wait thirty seconds, fill four bots',async({browser},info)=>{
  const edge=await chromium.launch({channel:'msedge',headless:true}),chrome=await browser.newContext(),edgeContext=await edge.newContext();
  try{
    const a=await chrome.newPage(),b=await edgeContext.newPage();await ready(a);await ready(b);const began=Date.now();
    await a.getByRole('button',{name:'Join quick match'}).click();await b.getByRole('button',{name:'Join quick match'}).click();
    for(const p of [a,b])await loaded(p);expect(Date.now()-began).toBeGreaterThanOrEqual(29500);
    const roster=await a.evaluate(()=>window.__gltrof.room.roster);expect(roster).toHaveLength(6);expect(roster.filter(p=>p.bot)).toHaveLength(4);expect(await b.locator('#room-code').textContent()).toBe(await a.locator('#room-code').textContent());
    for(const p of [a,b])for(const [slot,player] of roster.entries())if(player.bot)expect(await p.evaluate(slot=>window.__gltrof.module.ccall('web_bot_level','number',['number'],[slot]),slot)).toBe(player.botDifficulty);
    for(const p of [a,b])await expect(p.locator('#quick-status')).not.toContainText('changed repeatedly');
    await b.screenshot({path:'visual-review/firebase-quick-chrome-edge.png'});
  }finally{await chrome.close();await edge.close();}
});
test('solo waits thirty seconds, respects required settings, launches five native bots',async({page})=>{
  await ready(page);await page.locator('#quick-preferences summary').click();await page.locator('#quick-form [name=mode]').selectOption('snake');await page.locator('#quick-form [name=required-mode]').check();await page.locator('#quick-form [name=gridSize]').selectOption('960');await page.locator('#quick-form [name=required-gridSize]').check();
  const began=Date.now();await page.getByRole('button',{name:'Join quick match'}).click();await loaded(page);expect(Date.now()-began).toBeGreaterThanOrEqual(29500);
  const room=await page.evaluate(()=>window.__gltrof.room);expect(room.meta.mode).toBe('snake');expect(room.meta.gridSize).toBe(960);expect(room.roster.filter(p=>p.bot)).toHaveLength(5);expect(room.roster).toHaveLength(6);
});
test('four human seats across Chrome and Edge start early without bots',async({browser})=>{
  const edge=await chromium.launch({channel:'msedge',headless:true}),aContext=await browser.newContext(),bContext=await edge.newContext();
  try{const a=await aContext.newPage(),b=await bContext.newPage();for(const p of [a,b]){await ready(p);await p.locator('#local-players').selectOption('2');}const began=Date.now();for(const p of [a,b])await p.getByRole('button',{name:'Join quick match'}).click();for(const p of [a,b])await loaded(p);expect(Date.now()-began).toBeLessThan(30000);expect(await a.evaluate(()=>window.__gltrof.room.roster.length)).toBe(4);expect(await a.evaluate(()=>window.__gltrof.room.meta.matchPoints)).toBe(25);expect(await a.evaluate(()=>window.__gltrof.room.roster.filter(p=>p.bot).length)).toBe(0);
  }finally{await aContext.close();await edge.close();}
});

test('ranked waits past thirty seconds for another Google player and never inserts bots',async({browser})=>{
  const contexts=await Promise.all([0,1].map(()=>browser.newContext()));
  async function login(p,label){
    await ready(p);const pending=p.waitForEvent('popup');await p.locator('#account-button').click();const popup=await pending;await popup.waitForLoadState('domcontentloaded');expect(new URL(popup.url()).origin).toBe('http://127.0.0.1:9099');await popup.getByText('Add new account',{exact:true}).click();await popup.getByLabel('Email',{exact:false}).fill(label+'-'+Date.now()+'@example.test');await popup.getByRole('button',{name:/sign in/i}).click();await expect(p.locator('#account-button')).toHaveText('Sign out');await p.locator('#quick-form [name=competition]').selectOption('ranked');
  }
  try{
    const a=await contexts[0].newPage(),b=await contexts[1].newPage();await login(a,'RankedQueueA');await a.getByRole('button',{name:'Join quick match'}).click();
    await expect.poll(()=>a.evaluate(async()=>{const s=window.__gltrof,e=(await s.store.get('quickQueue')).entries[s.browserId];return e?s.store.now()-e.joinedAt:0;}),{timeout:35000,intervals:[1000]}).toBeGreaterThanOrEqual(30000);
    await expect(a.locator('#game')).toBeHidden();await expect(a.locator('#quick-status')).toContainText('ranked never uses bots');
    await login(b,'RankedQueueB');await b.getByRole('button',{name:'Join quick match'}).click();for(const p of [a,b])await loaded(p);
    const room=await a.evaluate(()=>window.__gltrof.room);expect(room.meta.competition).toBe('ranked');expect(room.roster).toHaveLength(2);expect(room.roster.some(p=>p.bot)).toBe(false);expect(await a.evaluate(()=>window.__gltrof.ranked.ballot.meta.voterCount)).toBe(2);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
