import {test,expect} from '@playwright/test';
import {openHost} from './landing-helpers.js';
test.skip(!process.env.GLTROF_AUTH_EMULATOR,'Run with playwright.ranked.config.js and local Firebase emulators.');

async function googleLogin(page,label,navigate=true){
  if(navigate)await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__gltrof?.store?.mode)).toBe('firebase');
  expect(await page.evaluate(()=>window.__gltrof.store.auth.emulatorConfig?.host)).toBe('127.0.0.1');
  const popupPromise=page.waitForEvent('popup');await page.locator('#account-button').click();const popup=await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  expect(new URL(popup.url()).origin).toBe('http://127.0.0.1:9099');
  await popup.getByText('Add new account',{exact:true}).click();
  await popup.getByLabel('Email', {exact:false}).fill(label+'-'+Date.now()+'@example.test');
  await popup.getByRole('button',{name:/sign in/i}).click();
  await expect(page.locator('#account-button')).toHaveText('Sign out');
  await page.locator('#player-name').fill(label);
}

test('Google sign-in and sign-out preserve an existing group',async({browser})=>{
  const ca=await browser.newContext(),cb=await browser.newContext();
  try{
    const a=await ca.newPage(),b=await cb.newPage();await a.goto('/');await a.locator('#party-create').click();await expect(a.locator('#party-active')).toBeVisible();const code=await a.locator('#party-label').textContent();await b.goto('/?party='+code);await expect(b.locator('#party-active')).toBeVisible();await expect(a.locator('#party-members li')).toHaveCount(2);
    await googleLogin(b,'New Ranked Buddy',false);await expect(b.locator('#party-active')).toBeVisible();await expect(b.locator('#party-label')).toHaveText(code);await expect.poll(()=>a.evaluate(()=>window.__gltrof.party.members().filter(m=>m.google).length)).toBe(1);
    await b.locator('#account-button').click();await expect(b.locator('#account-button')).toHaveText('Sign in with Google');await expect(b.locator('#party-active')).toBeVisible();await expect(a.locator('#party-members li')).toHaveCount(2);await expect.poll(()=>a.evaluate(()=>window.__gltrof.party.members().filter(m=>m.google).length)).toBe(0);
  }finally{await ca.close();await cb.close();}
});

test('ranked group requires everyone’s consent; any member hosts all riders; world standings update',async({browser},info)=>{
  const contexts=await Promise.all([0,1].map(()=>browser.newContext()));
  try{
    const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));await googleLogin(a,'Group Captain');await googleLogin(b,'Group Buddy');
    await a.locator('#local-players').selectOption('2');await a.locator('#party-create').click();await expect(a.locator('#party-active')).toBeVisible();
    await b.locator('#party-code').fill(await a.locator('#party-label').textContent());await b.locator('#party-join').click();await expect(b.locator('#party-members li')).toHaveCount(2);
    await openHost(b);await b.locator('#create-form [name=competition]').selectOption('ranked');await b.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(b.locator('#host-status')).toContainText('Ready for ranked');await b.locator('#close-host').click();
    await a.locator('#party-ranked').check();await b.locator('#party-ranked').check();await expect.poll(()=>b.evaluate(()=>window.__gltrof.party.members().every(m=>m.allowRanked))).toBe(true);
    await openHost(b);await b.locator('#create-form [name=matchPoints]').fill('1');await b.locator('#create-form [name=gridSize]').selectOption('240');await b.locator('#create-form [name=speed]').selectOption('14');await b.getByRole('button',{name:'Create lobby',exact:true}).click();
    for(const p of [a,b])await expect(p.locator('#lobby')).toBeVisible({timeout:20000});await expect(b.locator('#player-list .player')).toHaveCount(3);await b.locator('#start-game').click();
    for(const p of [a,b])await expect(p.locator('#game-loading')).toBeHidden({timeout:35000});await expect(b.locator('#ranked-result')).toContainText('Results confirmed',{timeout:45000});
    expect(await b.evaluate(()=>window.__gltrof.ranked.ballot.meta.voterCount)).toBe(2);
    await a.locator('#exit-game').click();await expect(a.locator('#landing')).toBeVisible();await a.locator('#open-rankings').click();await expect(a.locator('#your-position')).toHaveText(/#\d+/);await expect(a.locator('#your-matches')).toContainText('1 match');await a.locator('#ranking-limit').selectOption('100');await expect(a.locator('#ranking-rows .your-row')).toHaveCount(1);await a.screenshot({path:`visual-review/ranked-leaderboard-${info.project.name}.png`,fullPage:true});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});

for(const mode of ['classic','snake','teams'])test(`Google sign-in, ranked ${mode}, split-screen eligibility and rematch`,async({browser},info)=>{
  const a=await browser.newContext(),b=await browser.newContext();
  try{
    const host=await a.newPage(),guest=await b.newPage();
    await googleLogin(host,'Ranked Host');await host.reload();await expect(host.locator('#account-button')).toHaveText('Sign out');
    await host.locator('#local-players').selectOption('2');await openHost(host);
    await host.locator('#create-form [name=competition]').selectOption('ranked');
    await host.locator('#create-form [name=mode]').selectOption(mode);
    await expect(host.locator('#create-ranked-note')).toContainText('only Player 1 earns MMR');
    await host.locator('#create-form [name=matchPoints]').fill('1');
    await host.locator('#create-form [name=gridSize]').selectOption('240');
    await host.locator('#create-form [name=speed]').selectOption('14');
    await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();
    const code=await host.locator('#room-code').textContent();
    await googleLogin(guest,'Ranked Guest');await guest.locator('#join-form [name=roomCode]').fill(code);
    await guest.getByRole('button',{name:'Join lobby',exact:true}).click();await expect(guest.locator('#join-match-notice')).toContainText('MMR will change');
    await guest.locator('#join-form').getByRole('button',{name:'Join ranked',exact:true}).click();await expect(guest.locator('#lobby')).toBeVisible();
    await expect(host.locator('#player-list')).toContainText('Unranked local guest');await expect(host.locator('#bot-controls')).toBeHidden();
    await host.getByRole('button',{name:'Start match',exact:true}).click();
    for(const page of [host,guest]){await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#game-loading')).toBeHidden({timeout:35000});}
    await expect(host.locator('#rematch-panel')).toBeVisible({timeout:45000});
    await expect(host.locator('#ranked-result')).toContainText('Results confirmed',{timeout:35000});
    const record=await host.evaluate(()=>window.__gltrof.ranked.ballot);
    expect(record.meta.voterCount).toBe(2);expect(Object.keys(record.reports)).toHaveLength(2);
    expect(record.meta.players.filter(p=>p.uid)).toHaveLength(2);
    const ladder=mode==='classic'?'normal':mode==='teams'?'team':'snake';
    const uid=await host.evaluate(()=>window.__gltrof.store.uid);
    expect(await host.evaluate(({ladder,uid})=>window.__gltrof.ranked.ratings[ladder][uid].games,{ladder,uid})).toBe(1);
    await host.screenshot({path:`visual-review/ranked-${mode}-${info.project.name}.png`});
    if(mode==='classic'){
      const first=await host.evaluate(()=>window.__gltrof.ranked.id);
      await guest.locator('#play-again').click();await host.locator('#play-again').click();await host.locator('#start-rematch').click();
      await expect.poll(()=>host.evaluate(()=>window.__gltrof.ranked.id)).not.toBe(first);
      await expect(host.locator('#ranked-result')).toContainText('Results confirmed',{timeout:45000});
      await expect.poll(()=>host.evaluate(({ladder,uid})=>window.__gltrof.ranked.ratings[ladder][uid]?.games||0,{ladder,uid}),{timeout:45000}).toBe(2);
      await host.locator('#exit-game').click();await guest.locator('#exit-game').click();
      await expect(host.locator('#landing')).toBeVisible();await expect(guest.locator('#landing')).toBeVisible();
      await openHost(host);await expect(host.locator('#create-form [name=competition]')).toHaveValue('casual');
      await host.locator('#create-form [name=matchPoints]').fill('1');await host.locator('#create-form [name=gridSize]').selectOption('240');await host.locator('#create-form [name=speed]').selectOption('14');
      await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();
      await guest.locator('#join-form [name=roomCode]').fill(await host.locator('#room-code').textContent());
      await guest.getByRole('button',{name:'Join lobby',exact:true}).click();await expect(guest.locator('#lobby')).toBeVisible();
      await host.getByRole('button',{name:'Start match',exact:true}).click();
      await expect(host.locator('#rematch-panel')).toBeVisible({timeout:45000});
      expect(await host.evaluate(({ladder,uid})=>window.__gltrof.ranked.ratings[ladder][uid].games,{ladder,uid})).toBe(2);
      await expect(host.locator('#ranked-result')).toBeEmpty();
    }
    await host.locator('#exit-game').click();await expect(host.locator('#landing')).toBeVisible();
    await expect(host.locator('#account-button')).toHaveText('Sign out');await host.locator('#account-button').click();
    await expect(host.locator('#account-button')).toHaveText('Sign in with Google');
    await host.locator('#quick-form [name=competition]').selectOption('ranked');await host.locator('#quick-form [type=submit]').click();
    await expect(host.locator('#quick-status')).toContainText('Sign in with Google');
  }finally{await a.close();await b.close();}
});

test('ranked host departure preserves frozen votes and remaining majority can finalize',async({browser},info)=>{
  test.skip(info.project.name!=='Chrome','Ordinary host handover is also covered in each browser.');
  const contexts=await Promise.all(Array.from({length:3},()=>browser.newContext()));
  try{
    const pages=await Promise.all(contexts.map(c=>c.newPage())),host=pages[0];
    for(const [i,page] of pages.entries())await googleLogin(page,'Handover '+i);
    const hostUid=await host.evaluate(()=>window.__gltrof.store.uid);
    await openHost(host);await host.locator('#create-form [name=competition]').selectOption('ranked');await host.locator('#create-form [name=matchPoints]').fill('1');await host.locator('#create-form [name=gridSize]').selectOption('960');await host.locator('#create-form [name=speed]').selectOption('6');
    await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();const code=await host.locator('#room-code').textContent();
    for(const page of pages.slice(1)){await page.locator('#join-form [name=roomCode]').fill(code);await page.getByRole('button',{name:'Join lobby',exact:true}).click();await page.locator('#join-form').getByRole('button',{name:'Join ranked',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();}
    await host.getByRole('button',{name:'Start match',exact:true}).click();
    for(const page of pages){await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#game-loading')).toBeHidden({timeout:35000});}
    const id=await host.evaluate(()=>window.__gltrof.ranked.id);await host.close();
    await expect(pages[1].locator('#ranked-result')).toContainText('Results confirmed',{timeout:60000});
    const record=await pages[1].evaluate(()=>window.__gltrof.ranked.ballot);
    expect(await pages[1].evaluate(()=>window.__gltrof.ranked.id)).toBe(id);expect(record.meta.voterCount).toBe(3);
    expect(Object.keys(record.reports)).toHaveLength(2);expect(record.final.uid).not.toBe(hostUid);
    expect(await pages[1].evaluate(uid=>window.__gltrof.ranked.ratings.normal[uid].games,hostUid)).toBe(1);
  }finally{for(const context of contexts)await context.close();}
});

for(const count of [2,3])test(`${count} real browser reports: ${count===2?'host breaks tied vote':'host loses minority vote'}`,async({browser},info)=>{
  test.skip(info.project.name!=='Chrome','Voting mathematics and other ranked flows run across browsers.');
  const contexts=await Promise.all(Array.from({length:count},()=>browser.newContext()));
  try{
    const pages=await Promise.all(contexts.map(c=>c.newPage())),host=pages[0];
    for(const [i,page] of pages.entries())await googleLogin(page,'Vote '+i);
    await openHost(host);await host.locator('#create-form [name=competition]').selectOption('ranked');await host.locator('#create-form [name=matchPoints]').fill('1');await host.locator('#create-form [name=gridSize]').selectOption('240');await host.locator('#create-form [name=speed]').selectOption('14');
    await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();const code=await host.locator('#room-code').textContent();
    for(const page of pages.slice(1)){
      await page.locator('#join-form [name=roomCode]').fill(code);await page.getByRole('button',{name:'Join lobby',exact:true}).click();await page.locator('#join-form').getByRole('button',{name:'Join ranked',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();
    }
    // Deliberately make only the host's report disagree; leave native physics alone.
    await host.evaluate(()=>{const store=window.__gltrof.store,original=store.putOnce.bind(store);store.putOnce=(path,value)=>{
      if(path.includes('/reports/')){const a=value.placements.map((_,i)=>i+1);if(JSON.stringify(a)===value.key)[a[0],a[1]]=[a[1],a[0]];value={...value,placements:a,key:JSON.stringify(a)};}
      return original(path,value);
    };});
    await host.getByRole('button',{name:'Start match',exact:true}).click();
    await expect(host.locator('#ranked-result')).toContainText('Results confirmed',{timeout:60000});
    const record=await host.evaluate(()=>window.__gltrof.ranked.ballot),hostId=await host.evaluate(()=>window.__gltrof.browserId);
    expect(Object.keys(record.reports)).toHaveLength(count);
    if(count===2){expect(record.final.method).toBe('host-tiebreak');expect(record.final.key).toBe(record.reports[hostId].key);}
    else{expect(record.final.method).toBe('vote');expect(record.final.key).not.toBe(record.reports[hostId].key);}
  }finally{for(const context of contexts)await context.close();}
});
