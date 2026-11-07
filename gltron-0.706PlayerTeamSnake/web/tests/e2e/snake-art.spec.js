import {test,expect} from '@playwright/test';
import {openHost} from './landing-helpers.js';

test('original snake pickup renders green and gold instead of an incomplete black texture',async({page},info)=>{
  await page.goto('/');await page.locator('#local-players').selectOption('1');await openHost(page);await page.locator('#create-form [name=mode]').selectOption('snake');await page.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();await page.locator('#add-bot').click();await page.locator('#start-game').click();await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#game-loading')).toBeHidden({timeout:35000});
  await page.evaluate(async()=>{
    const m=window.__gltrof.module;m.webClock.terminate();m.ccall('web_new_match',null,[],[]);m.ccall('web_snapshot_save','number',[],[]);
    const bytes=m.webSnapshot.slice(),v=new DataView(bytes.buffer);v.setInt32(24,3,true);v.setInt32(28,-1,true);v.setInt32(32,2,true);
    let offset=56;for(let i=0;i<v.getUint32(12,true);i++){
      v.setInt32(offset,3,true);v.setInt32(offset+36,3,true);v.setInt32(offset+20,0,true);v.setFloat32(offset+24,3.5,true);
      const count=v.getInt32(offset+48,true)+1,trail=offset+144;
      v.setFloat32(trail,i?500:90,true);v.setFloat32(trail+4,i?500:100,true);v.setFloat32(trail+8,10,true);v.setFloat32(trail+12,0,true);offset=trail+16*count;
    }
    if(offset!==bytes.length-v.getUint32(52,true))throw Error('Snake offset '+offset+' vs '+(bytes.length-v.getUint32(52,true))+' bytes '+bytes.length);
        for(let i=0;i<32;i++)v.setInt32(offset+12*i+8,0,true);
    // Close enough to see the original artwork, outside pickup distance.
    v.setFloat32(offset,120,true);v.setFloat32(offset+4,110,true);v.setInt32(offset+8,1,true);
    m.webSnapshot=bytes;if(!m.ccall('web_snapshot_load','number',[],[]))throw Error('Snake scene rejected');
    // Replica renders without advancing the fixture's collisions or pickups.
    m.ccall('web_set_replica',null,['number'],[1]);m.webClock=(await import('/src/engine-clock.js')).startEngineClock(m);
  });
  await page.waitForTimeout(500);await page.evaluate(()=>window.__gltrof.module.webClock.terminate());
  const green=await page.locator('#player-view').evaluate(canvas=>{const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);const d=ctx.getImageData(Math.floor(c.width*.25),Math.floor(c.height*.1),Math.floor(c.width*.5),Math.floor(c.height*.6)).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+1]>100&&d[i+1]>d[i]*1.3&&d[i+1]>d[i+2]*1.3)n++;return n;});
  expect(green).toBeGreaterThan(12);await page.screenshot({path:`visual-review/snake-original-pickup-${info.project.name}.png`});
});
