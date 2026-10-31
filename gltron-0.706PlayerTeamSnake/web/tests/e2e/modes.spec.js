import {test,expect} from '@playwright/test';

for(const mode of ['classic','snake','teams','team-snake'])test(`six-rider ${mode} renders through movement`,async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='Chrome','Mode coverage complements controls/media checks in all three browsers.');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.locator('#create-form [name=playerName]').fill('Mode Rider');
  await page.locator('#create-form [name=lobbyName]').fill(`${mode} visual check`);
  await page.locator('#create-form [name=mode]').selectOption(mode);
  await page.locator('#create-form [name=localPlayers]').selectOption('4');
  await page.locator('#create-form [name=gridSize]').selectOption('960');
  await page.locator('#create-form [name=speed]').selectOption('6');
  await page.locator('#create-form [name=botDifficulty]').selectOption('3');
  await page.getByRole('button',{name:'Create lobby'}).click();
  await page.getByRole('button',{name:'Add bot'}).click();
  await page.getByRole('button',{name:'Add bot'}).click();
  await expect(page.locator('#player-list .player')).toHaveCount(6);
  await page.getByRole('button',{name:'Start match'}).click();
  await expect(page.locator('#game')).toBeVisible({timeout:35000});await expect(page.locator('#game-loading')).toBeHidden({timeout:30000});
  for(const keys of [['ArrowLeft','a','j','Numpad1'],['ArrowRight','d','l','Numpad3']]){
    for(const key of keys)await page.keyboard.press(key);
    await page.waitForTimeout(700);
    const panes=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=320;c.height=180;
      const x=c.getContext('2d');x.drawImage(document.querySelector('#player-view'),0,0,320,180);
      return [[0,0],[160,0],[0,90],[160,90]].map(([left,top])=>{
        const p=x.getImageData(left,top,160,90).data;let lit=0;
        for(let i=0;i<p.length;i+=4)if(Math.max(p[i],p[i+1],p[i+2])>35)lit++;
        return lit/(p.length/4);
      });
    });
    for(const brightness of panes)expect(brightness).toBeGreaterThan(.05);
  }
  await expect(page.locator('#scoreboard span')).toHaveCount(6);
  await page.screenshot({path:`visual-review/mode-${mode}.png`});
  expect(errors).toEqual([]);
});
