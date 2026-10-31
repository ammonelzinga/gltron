import {test,expect} from '@playwright/test';
import {start,call} from './native-helpers.js';

test('each browser renders native state and host departure transfers live match',async({context},info)=>{
  const {pages,errors}=await start(context),[host,guest,other]=pages;
  for(const p of pages){
    await expect(p.locator('#player-view')).toBeVisible();await expect(p.locator('#remote-game')).toBeHidden();
    expect(await p.evaluate(()=>!!document.querySelector('#gltron-canvas').gameModule)).toBe(true);
    expect(await p.evaluate(()=>[...window.__gltrof.network.mesh.peers.values()].every(e=>e.pc.getSenders().every(s=>!s.track)))).toBe(true);
  }
  const direction=await call(host,'web_player_direction',[1]);await guest.keyboard.press('ArrowLeft');
  for(const p of pages)await expect.poll(()=>call(p,'web_player_direction',[1])).toBe((direction+3)%4);
  await guest.keyboard.down(',');expect(await call(guest,'web_control_state',[1,4])).not.toBe(0);expect(await call(host,'web_control_state',[1,4])).toBe(0);await guest.keyboard.up(',');
  const term=await guest.evaluate(()=>window.__gltrof.room.authority.term);
  await host.close();
  await expect.poll(()=>guest.evaluate(()=>window.__gltrof.room.authority.term),{timeout:15000}).toBeGreaterThan(term);
  const leader=await guest.evaluate(()=>window.__gltrof.host)?guest:other;
  await expect.poll(()=>leader.evaluate(()=>window.__gltrof.network.readyAuthority),{timeout:15000}).toBe(true);
  await expect.poll(()=>other.evaluate(()=>window.__gltrof.network.checkpoints.get('single')?.term),{timeout:15000}).toBeGreaterThan(term);
  const roster=await leader.evaluate(()=>window.__gltrof.room.roster),slot=roster.find(p=>p.name==='Native 1').slot;
  await expect.poll(()=>call(leader,'web_player_active',[slot]),{timeout:15000}).toBe(1);
  const before=await call(leader,'web_player_direction',[slot]);await guest.keyboard.press('ArrowRight');
  await expect.poll(()=>call(leader,'web_player_direction',[slot])).toBe((before+1)%4);
  await guest.screenshot({path:`visual-review/migration-${info.project.name}.png`});
  expect(errors).toEqual([]);
});

test('two parallel tournament arenas survive organizer departure',async({context},info)=>{
  const host=await context.newPage(),guests=[await context.newPage(),await context.newPage(),await context.newPage()];
  await host.goto('/');await host.locator('#create-form [name=playerName]').fill('Organizer');await host.locator('#create-form [name=lobbyName]').fill('Migration cup');
  await host.locator('#session-kind').selectOption('tournament');await host.locator('[name=hostParticipates]').uncheck();
  await host.locator('[name=playersPerHeat]').selectOption('2');await host.locator('[name=advancePerHeat]').selectOption('1');await host.locator('[name=maxParallel]').selectOption('2');await host.locator('[name=seeding]').selectOption('join');
  await host.locator('#create-form [name=gridSize]').selectOption('960');await host.locator('#create-form [name=speed]').selectOption('6');await host.locator('[name=pointsToWin]').fill('99');
  await host.getByRole('button',{name:'Create lobby'}).click();await expect(host.locator('#lobby')).toBeVisible();
  const code=await host.locator('#room-code').textContent();
  for(const [index,p] of guests.entries()){
    await p.goto(`/?room=${code}`);await p.locator('#join-form [name=playerName]').fill(`Cup ${index}`);if(index===0)await p.locator('#join-form [name=localPlayers]').selectOption('2');
    await p.getByRole('button',{name:'Join lobby'}).click();await expect(p.locator('#lobby')).toBeVisible();
  }
  await expect(host.locator('#player-list .player')).toHaveCount(5);
  await host.getByRole('button',{name:'Start tournament'}).click();
  await host.getByRole('button',{name:'Launch arena'}).first().click();await expect(host.locator('#host-arenas .arena-view')).toHaveCount(1,{timeout:35000});
  await host.getByRole('button',{name:'Launch arena'}).first().click();await expect(host.locator('#host-arenas .arena-view')).toHaveCount(2,{timeout:35000});
  await expect.poll(()=>host.evaluate(()=>[...window.__gltrof.network.readies.values()].reduce((n,s)=>n+s.size,0)),{timeout:35000}).toBeGreaterThanOrEqual(3);
  const epochs=await host.evaluate(()=>Object.fromEntries([...window.__gltrof.arenas].map(([id,a])=>{a.module.ccall('web_restart_round',null,[],[]);return[id,a.module.ccall('web_round_generation','number',[],[])];})));
  for(const p of guests)await expect.poll(()=>p.evaluate(epochs=>Object.entries(epochs).every(([id,epoch])=>{const cp=window.__gltrof.network.checkpoints.get(id);return cp&&new DataView(cp.raw.buffer,cp.raw.byteOffset).getUint32(16,true)>=epoch;}),epochs),{timeout:15000}).toBe(true);
  const term=await guests[0].evaluate(()=>window.__gltrof.room.authority.term);await host.close();
  await expect.poll(async()=>{for(const p of guests)if(await p.evaluate(()=>window.__gltrof.host&&window.__gltrof.network.readyAuthority&&window.__gltrof.arenas.size===2))return true;return false;},{timeout:20000}).toBe(true);
  for(const p of guests)await expect.poll(()=>p.evaluate(term=>[...window.__gltrof.network.checkpoints.values()].filter(cp=>cp.term>term).length,term),{timeout:15000}).toBe(2);
  await guests[0].screenshot({path:`visual-review/tournament-migration-${info.project.name}.png`});
});


