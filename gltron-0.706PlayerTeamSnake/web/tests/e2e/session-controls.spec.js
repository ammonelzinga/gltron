import {test,expect} from '@playwright/test';
import {start} from './native-helpers.js';

test('lost lobby responses retry without repeating committed changes',async({page,request},info)=>{
  test.skip(info.project.name!=='Chrome','Shared development backend needs one coverage run.');
  await page.goto('/');let dropped=false;
  await page.route('**/__gltrof_local',async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON().action==='create'&&!dropped){
      dropped=true;await route.fetch();await route.abort();
    }else await route.continue();
  });
  await page.locator('#create-form [name=playerName]').fill('Retry host');
  await page.locator('#create-form [name=lobbyName]').fill('Retry check');
  await page.getByRole('button',{name:'Create lobby'}).click();
  await expect(page.locator('#lobby')).toBeVisible();expect(dropped).toBe(true);
  await expect(page.locator('#player-list .player')).toHaveCount(1);
  const data={action:'cas',path:'signals/deduplication-'+crypto.randomUUID(),revision:0,value:{revision:1},requestId:crypto.randomUUID()};
  const post=()=>request.post('/__gltrof_local',{headers:{'x-gltrof-local':'1'},data});
  const first=await(await post()).json(),second=await(await post()).json();
  expect(first.result).toBe(true);expect(second.result).toBe(true);
  expect(second.version).toBe(first.version);
  const orphan=await request.post('/__gltrof_local',{headers:{'x-gltrof-local':'1'},data:{action:'set',path:'rooms/ORPHAN/scores',value:{ghost:1}}});
  expect(orphan.status()).toBe(400);
  const absent=await request.post('/__gltrof_local',{headers:{'x-gltrof-local':'1'},data:{action:'get',path:'rooms/ORPHAN'}});
  expect((await absent.json()).result).toBeNull();
});

test('Exit hands over hosting and final Exit removes the room',async({context})=>{
  const {pages,code}=await start(context);
  for(const page of pages){
    await page.locator('#exit-game').click();
    await expect(page.locator('#landing')).toBeVisible();
  }
  await expect.poll(()=>pages[2].evaluate(()=>Boolean(window.__gltrof?.store))).toBe(true);
  expect(await pages[2].evaluate(code=>window.__gltrof.store.get('rooms/'+code),code)).toBeNull();
});

test('spectator switches native rider cameras and parallel tournament games',async({context},info)=>{
  const host=await context.newPage();await host.goto('/');
  await host.locator('#create-form [name=playerName]').fill('Organizer');
  await host.locator('#create-form [name=lobbyName]').fill('Spectator checks');
  await host.locator('#session-kind').selectOption('tournament');
  await host.locator('[name=hostParticipates]').uncheck();
  await host.locator('[name=playersPerHeat]').selectOption('2');
  await host.locator('[name=advancePerHeat]').selectOption('1');
  await host.locator('[name=maxParallel]').selectOption('2');
  await host.locator('[name=seeding]').selectOption('join');
  await host.locator('[name=pointsToWin]').fill('99');
  await host.locator('#create-form [name=gridSize]').selectOption('960');
  await host.locator('#create-form [name=speed]').selectOption('6');
  await host.getByRole('button',{name:'Create lobby'}).click();
  await expect(host.locator('#lobby')).toBeVisible();const code=await host.locator('#room-code').textContent();
  for(let i=0;i<2;i++){
    const p=await context.newPage();await p.goto('/?room='+code);
    await p.locator('#join-form [name=playerName]').fill('Riders '+i);
    await p.locator('#join-form [name=localPlayers]').selectOption('2');
    await p.getByRole('button',{name:'Join lobby'}).click();await expect(p.locator('#lobby')).toBeVisible();
  }
  await expect(host.locator('#player-list .player')).toHaveCount(5);
  await host.getByRole('button',{name:'Start tournament'}).click();
  for(let i=1;i<=2;i++){
    await host.getByRole('button',{name:'Launch arena'}).first().click();
    await expect(host.locator('#host-arenas .arena-view')).toHaveCount(i,{timeout:35000});
  }
  const spectator=await context.newPage();await spectator.goto('/?room='+code);
  await spectator.locator('#join-form [name=playerName]').fill('Watcher');
  await spectator.getByRole('button',{name:'Join lobby'}).click();
  await expect(spectator.locator('[data-watch-match]')).toHaveCount(2);
  await spectator.locator('[data-watch-match]').first().click();
  await expect(spectator.locator('#game')).toBeVisible();
  await expect(spectator.locator('#game')).toBeVisible({timeout:35000});await expect(spectator.locator('#game-loading')).toBeHidden({timeout:35000});
  const first=await spectator.evaluate(()=>window.__gltrof.guestMatchId);
  await spectator.keyboard.press('ArrowRight');
  await expect.poll(()=>spectator.evaluate(()=>window.__gltrof.module.webVisibleSlots)).toBe(2);
  await spectator.waitForTimeout(1100);
  await expect(spectator.locator('#game')).toBeVisible();
  await spectator.keyboard.press('ArrowDown');
  await expect.poll(()=>spectator.evaluate(()=>window.__gltrof.nativeArenaId),{timeout:35000}).not.toBe(first);
  await expect(spectator.locator('#game')).toBeVisible({timeout:35000});await expect(spectator.locator('#game-loading')).toBeHidden({timeout:35000});
  const light=()=>spectator.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d');x.drawImage(document.querySelector('#player-view'),0,0,160,90);const d=x.getImageData(0,0,160,90).data;let n=0;for(let i=0;i<d.length;i+=4)if(Math.max(d[i],d[i+1],d[i+2])>30)n++;return n;});
  await expect.poll(light,{timeout:10000}).toBeGreaterThan(1000);
  await spectator.screenshot({path:`visual-review/spectator-${info.project.name}.png`});
  await spectator.locator('#exit-game').click();
  await expect(spectator.locator('#lobby')).toBeVisible();
  await spectator.waitForTimeout(1200);
  await expect(spectator.locator('#lobby')).toBeVisible();
});
