import {openHost,openPreferences,openAdvanced,openJoinPassword} from './landing-helpers.js';
import {test,expect} from '@playwright/test';

for (const [splitBrowser,counts] of [[3,1,1,1],[1,3,1,1],[2,2,1,1],[4,1,1]].entries()) {
  test(`six riders, local counts ${counts.join('-')}`,async({context},testInfo)=>{
    test.skip(testInfo.project.name!=='Chrome','Four simultaneous media feeds verified in Chrome; single feeds covered across browsers.');
    const pages=await Promise.all(Array.from({length:counts.length},()=>context.newPage()));
    const errors=[];
    pages.forEach((page,index)=>page.on('pageerror',error=>{errors.push(`${index}: ${error.message}`);console.log('Browser error',index,error.message);}));
    const host=pages[0];
    await host.goto('/');
    await host.locator('#player-name').fill('Host');
    await openHost(host);await host.locator('#create-form [name=lobbyName]').fill('Six-rider visual check');
    await host.locator('#local-players').selectOption(String(counts[0]));
    await host.locator('#create-form [name=gridSize]').selectOption('960');
    await host.locator('#create-form [name=speed]').selectOption('6');
    await host.getByRole('button',{name:'Create lobby'}).click();
    await expect(host.locator('#lobby')).toBeVisible();
    const code=await host.locator('#room-code').textContent();
    for(let index=1;index<pages.length;index++){
      const page=pages[index];
      await page.goto(`/?room=${code}`);
      await page.locator('#player-name').fill(`Browser ${index+1}`);
      await page.locator('#local-players').selectOption(String(counts[index]));
      await page.getByRole('button',{name:'Join lobby'}).click();
      await expect(page.locator('#lobby')).toBeVisible();
    }
    await expect(host.locator('#player-list .player')).toHaveCount(6);
    await host.getByRole('button',{name:'Start match'}).click();
    await expect(host.locator('#game')).toBeVisible({timeout:35000});await expect(host.locator('#game-loading')).toBeHidden({timeout:30000});
    for(let index=1;index<pages.length;index++){
      await expect(pages[index].locator('#player-view')).toBeVisible();
      await expect(pages[index].locator('#game-loading')).toBeHidden({timeout:35000});
    }
    for(let index=0;index<pages.length;index++){
      const page=pages[index],localCount=counts[index],isSplit=localCount>1;
      await page.keyboard.press('ArrowLeft');
      if(isSplit){await page.keyboard.press('d');await page.keyboard.press('l');}
      const readBrightness=()=>page.evaluate(({index,localCount})=>{
        const source=document.querySelector('#player-view');
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
        const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,320,180);
        const rects=localCount===1?[[0,0,320,180]]:localCount===2?[[0,0,320,90],[0,90,320,90]]:[[0,0,160,90],[160,0,160,90],[0,90,160,90],[160,90,160,90]].slice(0,localCount);
        return rects.map(rect=>{const data=ctx.getImageData(...rect).data;let lit=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])>40)lit++;return lit/(data.length/4);});
      },{index,localCount});
      let cellBrightness;
      await expect(async()=>{
        cellBrightness=await readBrightness();
        for(const brightness of cellBrightness)expect(brightness).toBeGreaterThan(.05);
        await page.screenshot({path:`visual-review/perspective-${splitBrowser}-${index}-early.png`});
      }).toPass({timeout:15000});
      console.log(`split=${splitBrowser} browser=${index}`,cellBrightness);
      await expect(page.locator('#scoreboard span')).toHaveCount(6);
    }
    for(let index=0;index<pages.length;index++)await pages[index].screenshot({path:`visual-review/perspective-${splitBrowser}-${index}-later.png`});
    expect(errors).toEqual([]);
  });
}
