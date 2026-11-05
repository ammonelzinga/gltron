import {test,expect} from '@playwright/test';
import {openHost} from './landing-helpers.js';

test('real native crashes award one highest tier, including moving bike contact',async({page},info)=>{
  await page.goto('/');await page.locator('#local-players').selectOption('4');await openHost(page);await page.locator('#create-form [name=gridSize]').selectOption('960');await page.locator('#create-form [name=speed]').selectOption('6');await page.locator('#create-form [name=matchPoints]').fill('99');await page.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();await page.locator('#start-game').click();await expect(page.locator('#game')).toBeVisible({timeout:35000});await expect(page.locator('#game-loading')).toBeHidden({timeout:35000});
  const cases=[
    {name:'distant trail',heads:[[100,100,3],[110,150,2],[400,400,0],[600,600,0]],points:[0,.25,0,0]},
    {name:'close trail owner beats nearby opponent',heads:[[100,100,3],[110,101,2],[118,108,0],[600,600,0]],points:[0,.75,0,0]},
    {name:'nearby opponent beats distant trail owner',heads:[[100,100,3],[110,150,2],[118,108,0],[600,600,0]],points:[0,0,.5,0]},
    {name:'wall proximity',heads:[[958,100,3],[950,110,0],[400,400,0],[600,600,0]],points:[0,.5,0,0]},
    {name:'moving motorcycle contact ahead of trail',heads:[[100,100,3],[110,90,2],[400,400,0],[600,600,0]],points:[0,2,0,0]},
    {name:'simultaneous head-on, one award per crash',heads:[[100,100,3],[115,100,1],[400,400,0],[600,600,0]],points:[2,2,0,0]},
  ];
  for(const scenario of cases){
    await page.evaluate(async({heads})=>{
      const m=window.__gltrof.module;m.webClock.terminate();m.ccall('web_new_match',null,[],[]);m.ccall('web_snapshot_save','number',[],[]);
      const bytes=m.webSnapshot.slice(),v=new DataView(bytes.buffer);if(v.getUint32(4,true)!==2)throw Error('Unexpected snapshot layout');
      v.setInt32(24,1,true);v.setInt32(28,-1,true);v.setInt32(32,4,true);v.setUint32(20,0,true);
      const dx=[0,-1,0,1],dy=[-1,0,1,0];let offset=56;
      heads.forEach(([x,y,dir],index)=>{
        if(v.getInt32(offset+48,true)!==0)throw Error('Expected a fresh one-segment trail');
        v.setInt32(offset,dir,true);v.setInt32(offset+4,0,true);v.setInt32(offset+8,0,true);v.setFloat32(offset+12,6,true);v.setInt32(offset+20,0,true);v.setFloat32(offset+24,3.5,true);v.setInt32(offset+36,dir,true);v.setInt32(offset+56,0,true);
        const trail=offset+144,length=index===1&&dir===2?y-60:10;
        v.setFloat32(trail,x-length*dx[dir],true);v.setFloat32(trail+4,y-length*dy[dir],true);v.setFloat32(trail+8,length*dx[dir],true);v.setFloat32(trail+12,length*dy[dir],true);
        offset=trail+16;
      });
      m.webSnapshot=bytes;if(!m.ccall('web_snapshot_load','number',[],[]))throw Error('Scenario checkpoint rejected');
      m.webClock=(await import('/src/engine-clock.js')).startEngineClock(m);
    },scenario);
    await expect.poll(()=>page.evaluate(()=>window.__gltrof.module.ccall('web_player_active','number',['number'],[0])),{timeout:6000,intervals:[20]},scenario.name).toBe(0);
    const result=await page.evaluate(()=>{const m=window.__gltrof.module;m.webClock.terminate();return [0,1,2,3].map(i=>({points:m.ccall('web_player_trap_points','number',['number'],[i]),traps:m.ccall('web_player_traps','number',['number'],[i]),survival:m.ccall('web_player_survival','number',['number'],[i])}));});
    expect(result.map(r=>r.points),scenario.name).toEqual(scenario.points);expect(result.reduce((sum,r)=>sum+r.traps,0),scenario.name).toBe(scenario.name.startsWith('simultaneous')?2:1);
    if(scenario.name.startsWith('simultaneous'))expect(result.slice(0,2).map(r=>r.survival)).toEqual([0,0]);
  }
  await page.screenshot({path:`visual-review/tiered-traps-${info.project.name}.png`});
});
