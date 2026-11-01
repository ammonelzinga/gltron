import {openHost,openPreferences,openAdvanced,openJoinPassword} from './landing-helpers.js';
import {test,expect,chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';

async function normalChrome(){
  const profile=await mkdtemp(join(tmpdir(),'gltrof-background-'));
  const process=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore',windowsHide:true});
  let port;
  for(let attempt=0;attempt<100;attempt++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  if(!port){process.kill();throw Error('Normal Chrome did not start');}
  const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{noDefaults:true});
  return {browser,async close(){await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);process.kill();if(resolve(profile).startsWith(resolve(tmpdir())+sep)&&basename(profile).startsWith('gltrof-background-'))await rm(profile,{recursive:true,force:true,maxRetries:0}).catch(()=>{});}};
}

for(const crossBrowser of [false,true]){
  test(crossBrowser?'Chrome to Edge shares lobby and local rendering':'hidden Chrome host keeps moving',async({},testInfo)=>{
    test.skip(testInfo.project.name!=='Chrome','These tests explicitly launch the required real browsers.');
    test.skip(process.platform!=='win32','Uses installed Windows Chrome/Edge.');
    const options={headless:false,ignoreDefaultArgs:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']};
    const normal=crossBrowser?await(async()=>{const browser=await chromium.launch({...options,channel:'chrome'});return{browser,close:()=>browser.close()};})():await normalChrome(),chrome=normal.browser;
    const edge=crossBrowser?await chromium.launch({...options,channel:'msedge'}):null;
    try{
      const hostContext=crossBrowser?await chrome.newContext():chrome.contexts()[0],guestContext=crossBrowser?await edge.newContext():hostContext;
      const host=hostContext.pages()[0]||await hostContext.newPage(),guest=await guestContext.newPage();
      const errors=[];for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
      await host.bringToFront();
      await host.goto('http://127.0.0.1:4173/');
      await host.locator('#player-name').fill('Background Host');
      await openHost(host);await host.locator('#create-form [name=lobbyName]').fill('Background clock check');
      await host.locator('#local-players').selectOption('2');
      await host.locator('#create-form [name=gridSize]').selectOption('960');
      await host.locator('#create-form [name=speed]').selectOption('6');
      await host.getByRole('button',{name:'Create lobby'}).click();
      await expect(host.locator('#lobby')).toBeVisible();
      const code=await host.locator('#room-code').textContent();
      await guest.bringToFront();
      await guest.goto(`http://127.0.0.1:4173/?room=${code}`);
      await guest.locator('#player-name').fill('Other Browser');
      await guest.getByRole('button',{name:'Join lobby'}).click();
      await expect(guest.locator('#lobby')).toBeVisible();
      await expect(host.locator('#player-list .player')).toHaveCount(3);
      await host.bringToFront();
      await host.getByRole('button',{name:'Start match'}).click();
      await host.waitForTimeout(150);
      await guest.bringToFront();
      await expect(guest.locator('#game')).toBeVisible({timeout:35000});
      await expect(guest.locator('#game')).toBeVisible({timeout:35000});await expect(guest.locator('#game-loading')).toBeHidden({timeout:35000});
      await expect.poll(()=>host.evaluate(()=>window.__gltrof.network.readies.get('single')?.size||0)).toBe(1);
      await host.waitForTimeout(200);
      await host.bringToFront();
      for(const [key,action] of [['q',4],['w',3],['e',5]]){
        await host.keyboard.down(key);
        await host.waitForTimeout(150); // Allow queued SDL events to expose duplicate binding regressions.
        expect(await host.evaluate(()=>document.querySelector('#gltron-canvas').gameModule.ccall('web_control_state','number',['number','number'],[0,4]))).toBe(0);
        await expect.poll(()=>host.evaluate(action=>document.querySelector('#gltron-canvas').gameModule.ccall('web_control_state','number',['number','number'],[1,action]),action)).not.toBe(0);
        await host.keyboard.up(key);
      }
      await host.evaluate(()=>{window.frameCount=0;document.querySelector('#gltron-canvas').gameModule.webFrameConsumers.push(()=>window.frameCount++);});
      console.log('Local key isolation passed');
      await guest.bringToFront();
      if(!crossBrowser){
        await expect.poll(()=>host.evaluate(()=>document.visibilityState)).toBe('hidden');
      }
      const before=await host.evaluate(()=>window.frameCount);
      await guest.evaluate(()=>{window.frameCount=0;document.querySelector('#gltron-canvas').gameModule.webFrameConsumers.push(()=>window.frameCount++);});
      const videoBefore=await guest.evaluate(()=>window.frameCount);
      const hash=()=>guest.evaluate(()=>{const v=document.querySelector('#player-view'),c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d');x.drawImage(v,0,0,160,90);let h=0;for(const value of x.getImageData(0,0,160,90).data)h=((h*31)+value)|0;return h;});
      const initial=await hash();
      await guest.waitForTimeout(2500); // Verify actual progress while the host remains hidden/unfocused.
      const after=await host.evaluate(()=>window.frameCount);
      const videoAfter=await guest.evaluate(()=>window.frameCount);
      console.log({crossBrowser,visibility:await host.evaluate(()=>document.visibilityState),rendered:after-before,decoded:videoAfter-videoBefore});
      expect(after-before).toBeGreaterThan(15);
      expect(videoAfter-videoBefore).toBeGreaterThan(10);
      await expect.poll(hash).not.toBe(initial);
      await guest.screenshot({path:`visual-review/background-${crossBrowser?'edge':'chrome'}.png`});
      expect(errors).toEqual([]);
    }finally{await edge?.close();await normal.close();}
  });
}
