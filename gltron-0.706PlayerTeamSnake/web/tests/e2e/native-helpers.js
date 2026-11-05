import {openHost,openPreferences,openAdvanced,openJoinPassword} from './landing-helpers.js';
import {test,expect} from '@playwright/test';

async function start(context,count=3){
  const pages=await Promise.all(Array.from({length:count},()=>context.newPage()));
  const errors=[];for(const p of pages)p.on('pageerror',e=>errors.push(e.message));
  const host=pages[0];await host.goto('/');
  await host.locator('#player-name').fill('Native Host');
  await openHost(host);await host.locator('#create-form [name=lobbyName]').fill('Migration test');
  await host.locator('#create-form [name=gridSize]').selectOption('960');
  await host.locator('#create-form [name=speed]').selectOption('6');
  await host.locator('#create-form [name=matchPoints]').fill('99');
  await host.getByRole('button',{name:'Create lobby'}).click();await expect(host.locator('#lobby')).toBeVisible();
  const code=await host.locator('#room-code').textContent();
  for(let i=1;i<count;i++){
    await pages[i].goto(`/?room=${code}`);await pages[i].locator('#player-name').fill(`Native ${i}`);
    await pages[i].getByRole('button',{name:'Join lobby'}).click();await expect(pages[i].locator('#lobby')).toBeVisible();
  }
  await expect(host.locator('#player-list .player')).toHaveCount(count);
  await host.getByRole('button',{name:'Start match'}).click();
  for(const p of pages){await expect(p.locator('#game')).toBeVisible({timeout:35000});await expect(p.locator('#game-loading')).toBeHidden({timeout:35000});await expect.poll(()=>p.evaluate(()=>!!document.querySelector('#gltron-canvas').gameModule),{timeout:35000}).toBe(true);}
  return {pages,errors,code};
}
const call=(page,name,args)=>page.evaluate(({name,args})=>document.querySelector('#gltron-canvas').gameModule.ccall(name,'number',args.map(()=> 'number'),args),{name,args});


export {start,call};
