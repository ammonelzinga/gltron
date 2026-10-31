import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test('six-camera crash preserves impact timing, debris and rider camera',async({context},testInfo)=>{
  test.skip(testInfo.project.name==='Firefox','Crash rendering covered by Chrome and Edge.');
  const host=await context.newPage(),guest=await context.newPage();
  await host.goto('/');
  await host.locator('#create-form [name=playerName]').fill('Crash Host');
  await host.locator('#create-form [name=lobbyName]').fill('Crash visual check');
  await host.locator('#create-form [name=localPlayers]').selectOption('4');
  await host.locator('#create-form [name=gridSize]').selectOption('240');
  await host.getByRole('button',{name:'Create lobby'}).click();
  await expect(host.locator('#lobby')).toBeVisible();
  const code=await host.locator('#room-code').textContent();
  await guest.goto(`/?room=${code}`);
  await guest.locator('#join-form [name=playerName]').fill('Crash Guest');
  await guest.locator('#join-form [name=localPlayers]').selectOption('2');
  await guest.getByRole('button',{name:'Join lobby'}).click();
  await expect(host.locator('#player-list .player')).toHaveCount(6);
  await host.getByRole('button',{name:'Start match'}).click();
  await expect(host.locator('#game')).toBeVisible({timeout:35000});await expect(host.locator('#game-loading')).toBeHidden({timeout:30000});
  await host.evaluate(()=>{
    const source=document.querySelector('#gltron-canvas'),module=source.gameModule;
    window.crashCheck={samples:[],pictures:[]};
    module.webFrameConsumers.push(()=>{
      const radius=module.ccall('web_crash_state','number',['number','number'],[0,0]);
      if(radius<=0||radius>=30)return;
      module.ccall('web_set_camera_target',null,['number','number'],[0,1]);
      const impact=module.ccall('web_crash_state','number',['number','number'],[0,1]);
      const camera=module.ccall('web_crash_state','number',['number','number'],[0,2]);
      window.crashCheck.samples.push({radius,impact,camera});
      const stage=window.crashCheck.pictures.length;
      if(stage<3&&radius>=[2,7,16][stage]){
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=576;
        const rect=[0,1,2,3].map(i=>module.ccall('web_view_rect','number',['number','number'],[0,i]));
        canvas.getContext('2d').drawImage(source,rect[0],source.height-rect[1]-rect[3],rect[2],rect[3],0,0,1024,576);
        window.crashCheck.pictures.push(canvas.toDataURL());
      }
    });
  });
  await expect.poll(()=>host.evaluate(()=>window.crashCheck.pictures.length),{timeout:30000}).toBe(3);
  const result=await host.evaluate(()=>window.crashCheck);
  expect(result.samples.length).toBeGreaterThanOrEqual(3);
  for(const sample of result.samples){
    expect(sample.impact/sample.radius).toBeCloseTo(2.5,4);
    expect(sample.camera).toBe(0);
  }
  for(const [index,picture] of result.pictures.entries())await writeFile(`visual-review/crash-${testInfo.project.name}-${index}.png`,Buffer.from(picture.split(',')[1],'base64'));
  await guest.screenshot({path:`visual-review/crash-${testInfo.project.name}-guest.png`});
});
