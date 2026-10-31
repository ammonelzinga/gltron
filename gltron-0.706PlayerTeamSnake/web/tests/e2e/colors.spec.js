import {test,expect} from '@playwright/test';

test('minimap uses gold, red and cyan rider colors after turns',async({page},info)=>{
  test.skip(info.project.name!=='Chrome','Pixel color check uses the host source canvas.');
  await page.goto('/');
  await page.locator('#create-form [name=playerName]').fill('Color Rider');
  await page.locator('#create-form [name=lobbyName]').fill('Color Grid');
  await page.locator('#create-form [name=localPlayers]').selectOption('4');
  await page.locator('#create-form [name=gridSize]').selectOption('960');
  await page.locator('#create-form [name=speed]').selectOption('6');
  await page.getByRole('button',{name:'Create lobby'}).click();
  await page.getByRole('button',{name:'Start match'}).click();
  await expect(page.locator('#game')).toBeVisible({timeout:35000});await expect(page.locator('#game-loading')).toBeHidden({timeout:30000});
  for(const key of ['ArrowLeft','a','j','Numpad1'])await page.keyboard.press(key);
  await expect.poll(()=>page.evaluate(()=>{
    const source=document.querySelector('#gltron-canvas'),m=source.gameModule;
    const rect=[0,1,2,3].map(i=>m.ccall('web_view_rect','number',['number','number'],[0,i]));
    const w=Math.floor(rect[2]*.333),h=Math.floor(rect[3]*.333),c=document.createElement('canvas');c.width=w;c.height=h;
    const x=c.getContext('2d');x.drawImage(source,rect[0]+20,source.height-rect[1]-20-h,w,h,0,0,w,h);
    const p=x.getImageData(0,0,w,h).data,counts={gold:0,red:0,cyan:0};
    for(let i=0;i<p.length;i+=4){
      const [r,g,b]=p.slice(i,i+3);
      if(r>140&&g>60&&g<210&&b<80)counts.gold++;
      if(r>100&&g<60&&b<60)counts.red++;
      if(r<60&&g>60&&b>60)counts.cyan++;
    }
    return Math.min(...Object.values(counts));
  })).toBeGreaterThan(2);
  await page.keyboard.down(',');await page.waitForTimeout(350);
  await page.screenshot({path:'visual-review/solid-trails-colored-map.png'});
  await page.keyboard.up(',');
});
