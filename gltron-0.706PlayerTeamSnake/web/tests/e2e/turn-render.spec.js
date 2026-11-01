import {openHost,openPreferences,openAdvanced,openJoinPassword} from './landing-helpers.js';
import {test,expect} from '@playwright/test';

for(const locals of [1,2])test(`turns, boost and glance preserve ${locals}-local host and guest views`,async({context},testInfo)=>{
  const host=await context.newPage(),guest=await context.newPage(),errors=[];
  for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
  const call=(name,args)=>host.evaluate(({name,args})=>document.querySelector('#gltron-canvas').gameModule.ccall(name,'number',args.map(()=> 'number'),args),{name,args});
  const localCall=(page,name,args)=>page.evaluate(({name,args})=>document.querySelector('#gltron-canvas').gameModule.ccall(name,'number',args.map(()=> 'number'),args),{name,args});
  const brightness=(page,index)=>page.evaluate(({index,locals})=>{
    const c=document.createElement('canvas');c.width=320;c.height=180;
    const x=c.getContext('2d');x.drawImage(document.querySelector('#player-view'),0,0,320,180);
    return Array.from({length:locals},(_,i)=>{
      const p=x.getImageData(0,i*180/locals,320,180/locals).data;
      let lit=0;for(let k=0;k<p.length;k+=4)if(Math.max(p[k],p[k+1],p[k+2])>35)lit++;
      return lit/(p.length/4);
    });
  },{index,locals});
  await host.goto('/');
  await host.locator('#player-name').fill('Turn Host');
  await openHost(host);await host.locator('#create-form [name=lobbyName]').fill('Arrow picture check');
  await host.locator('#local-players').selectOption(String(locals));
  await host.locator('#create-form [name=gridSize]').selectOption('960');
  await host.locator('#create-form [name=speed]').selectOption('6');
  await host.getByRole('button',{name:'Create lobby'}).click();
  await expect(host.locator('#lobby')).toBeVisible();
  const code=await host.locator('#room-code').textContent();
  await guest.goto(`/?room=${code}`);
  await guest.locator('#player-name').fill('Turn Guest');
  await guest.locator('#local-players').selectOption(String(locals));
  await guest.getByRole('button',{name:'Join lobby'}).click();
  await expect(host.locator('#player-list .player')).toHaveCount(locals*2);
  await host.getByRole('button',{name:'Start match'}).click();
  await expect(host.locator('#game')).toBeVisible({timeout:35000});await expect(host.locator('#game-loading')).toBeHidden({timeout:30000});
  await expect.poll(()=>guest.evaluate(()=>(document.querySelector('#gltron-canvas').gameModule?1:0)),{timeout:30000}).toBeGreaterThan(0);
  for(const [index,page] of [host,guest].entries()){
    for(let local=0;local<locals;local++){
      const slot=index*locals+local;
      const keys=local===0?['ArrowLeft','ArrowRight','ArrowUp',',','.']:['a','d','w','q','e'];
      for(const [action,key] of keys.entries()){
        // Isolate each action from legitimate random collisions during the
        // preceding network assertions; still check real state and pixels.
        await call('web_restart_round',[]);
        const epoch=await call('web_round_generation',[]);await expect.poll(()=>localCall(guest,'web_round_generation',[])).toBe(epoch);
        expect(await call('web_player_active',[slot])).toBe(1);
        const before=await call('web_player_direction',[slot]);
        await page.keyboard.down(key);
        if(action<2)await expect.poll(()=>call('web_player_direction',[slot])).toBe((before+(action===0?3:1))%4);
        else await expect.poll(()=>localCall(action>=3?page:host,'web_control_state',[slot,action+1])).not.toBe(0);
        await page.waitForTimeout(180);
        await page.keyboard.up(key);
        if(action>=2)await expect.poll(()=>localCall(action>=3?page:host,'web_control_state',[slot,action+1])).toBe(0);
        for(const [viewerIndex,viewer] of [host,guest].entries()){
          for(const fraction of await brightness(viewer,viewerIndex))expect(fraction).toBeGreaterThan(.05);
        }
      }
    }
    await page.screenshot({path:`visual-review/turn-${testInfo.project.name}-${locals}-${index}.png`});
  }
  expect(errors).toEqual([]);
});
