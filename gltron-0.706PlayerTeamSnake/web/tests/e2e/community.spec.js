import {test,expect} from '@playwright/test';
import {openHost,openAdvanced} from './landing-helpers.js';
test.beforeEach(async({request})=>{for(const path of ['rooms','quickQueue','parties'])await request.post('/__gltrof_local',{headers:{'x-gltrof-local':'1'},data:{action:'set',path,value:{}}});});
async function group(a,b){
  await a.locator('#player-name').fill('Captain');await a.locator('#local-players').selectOption('2');await a.locator('#party-create').click();await expect(a.locator('#party-active')).toBeVisible();
  const code=await a.locator('#party-label').textContent();await b.locator('#player-name').fill('Buddy');await b.locator('#party-code').fill(code);await b.locator('#party-join').click();await expect(a.locator('#party-size')).toHaveText('3/6 riders');await expect(b.locator('#party-members li')).toHaveCount(2);
}
test('any group member brings everyone into password lobby; native split screen works',async({browser},info)=>{
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext()));
  try{const [a,b,host]=await Promise.all(contexts.map(c=>c.newPage()));for(const p of [a,b,host])await p.goto('/');await group(a,b);
    await openHost(host);await openAdvanced(host);await host.locator('#create-form [name=password]').fill('grid-secret');await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();const code=await host.locator('#room-code').textContent();
    await expect(host.locator('#lobby-invite')).toHaveValue(new RegExp('room='+code));await b.locator('#join-form [name=roomCode]').fill(code);await b.locator('#join-password summary').click();await b.locator('#join-form [name=password]').fill('grid-secret');await b.getByRole('button',{name:'Join lobby',exact:true}).click();
    for(const p of [a,b]){await expect(p.locator('#lobby')).toBeVisible({timeout:20000});await expect(p.locator('#room-code')).toHaveText(code);}
    await expect(host.locator('#player-list .player')).toHaveCount(4);await host.locator('#start-game').click();
    for(const p of [host,a,b]){await expect(p.locator('#game')).toBeVisible();await expect(p.locator('#game-loading')).toBeHidden({timeout:35000});}
    expect(await a.evaluate(()=>window.__gltrof.localPlayers.length)).toBe(2);expect(await b.evaluate(()=>window.__gltrof.localPlayers.length)).toBe(1);
    await a.screenshot({path:`visual-review/group-split-${info.project.name}.png`});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('group quick match pools all seats; rankings page works at mobile width',async({browser},info)=>{
  const ca=await browser.newContext(),cb=await browser.newContext();
  try{const a=await ca.newPage(),b=await cb.newPage();await a.goto('/');await b.goto('/');await group(a,b);await b.getByRole('button',{name:'Join quick match'}).click();
    for(const p of [a,b]){await expect(p.locator('#game')).toBeVisible({timeout:40000});await expect(p.locator('#game-loading')).toBeHidden({timeout:35000});}
    await a.locator('#exit-game').click();await expect(a.locator('#landing')).toBeVisible();await a.locator('#open-rankings').click();await expect(a.locator('#rankings-page')).toBeVisible();await a.locator('#ranking-mode').selectOption('snake');await a.locator('#ranking-limit').selectOption('100');await expect(a.locator('#your-position')).toHaveText('Unranked');await a.setViewportSize({width:390,height:844});await a.screenshot({path:`visual-review/rankings-mobile-${info.project.name}.png`});expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.locator('#ranking-home').click();await expect(a.locator('#landing')).toBeVisible();
  }finally{await ca.close();await cb.close();}
});
test('group invite links restore the group; full lobby rejects everyone together',async({browser})=>{
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext()));
  try{
    const [a,b,host]=await Promise.all(contexts.map(c=>c.newPage()));await a.goto('/');await a.locator('#local-players').selectOption('2');await a.locator('#party-create').click();await expect(a.locator('#party-active')).toBeVisible();
    await b.goto('/?party='+await a.locator('#party-label').textContent());await expect(b.locator('#party-active')).toBeVisible();await expect(a.locator('#party-size')).toHaveText('3/6 riders');
    await host.goto('/');await host.locator('#local-players').selectOption('4');await openHost(host);await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();
    await b.locator('#join-form [name=roomCode]').fill(await host.locator('#room-code').textContent());await b.getByRole('button',{name:'Join lobby',exact:true}).click();await expect(b.locator('#landing-status')).toContainText('whole group');
    await expect(a.locator('#landing')).toBeVisible();await expect(b.locator('#landing')).toBeVisible();await expect(host.locator('#player-list .player')).toHaveCount(4);
    await b.locator('#party-leave').click();await expect(a.locator('#party-size')).toHaveText('2/6 riders');await expect(b.locator('#party-active')).toBeHidden();
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
