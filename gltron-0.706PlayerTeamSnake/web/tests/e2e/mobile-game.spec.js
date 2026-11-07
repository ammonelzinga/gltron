import {test,expect} from '@playwright/test';
import {openHost} from './landing-helpers.js';

test('phone portrait and landscape fill viewport; touch steers, boost releases, split views resize',async({browser},info)=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:2});
  try{
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/');await page.screenshot({path:`visual-review/phone-home-${info.project.name}.png`,fullPage:true});
    await openHost(page);await page.locator('#create-form [name=mode]').selectOption('snake');await page.locator('#create-form [name=gridSize]').selectOption('960');await page.locator('#create-form [name=speed]').selectOption('6');await page.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();await page.locator('#add-bot').click();await page.locator('#start-game').click();await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#game-loading')).toBeHidden({timeout:45000});
    await expect.poll(()=>page.evaluate(()=>Boolean(window.__gltrof.module))).toBe(true);
    const dimensions=()=>page.evaluate(()=>{const canvas=document.querySelector('#player-view'),r=canvas.getBoundingClientRect(),m=window.__gltrof.module;return {x:r.x,y:r.y,w:r.width,h:r.height,aspect:m.ccall('web_view_rect','number',['number','number'],[0,2])/m.ccall('web_view_rect','number',['number','number'],[0,3]),screen:innerWidth/innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};});
    await expect.poll(async()=>Math.abs((await dimensions()).aspect-(await dimensions()).screen)).toBeLessThan(.01);
    let d=await dimensions();expect(d.w).toBe(390);expect(d.h).toBe(844);expect(d.overflow).toBe(false);
    const direction=()=>page.evaluate(()=>window.__gltrof.module.ccall('web_player_direction','number',['number'],[0]));
    const before=await direction();
    // Dispatch a touch pointer, avoiding fullscreen so the emulated viewport stays stable.
    await page.evaluate(()=>document.querySelector('#game').requestFullscreen=undefined);
    async function tap(x){await page.locator('#player-view').dispatchEvent('pointerdown',{pointerId:7,pointerType:'touch',clientX:x,clientY:420});await page.locator('#player-view').dispatchEvent('pointerup',{pointerId:7,pointerType:'touch'});}
    await tap(340);await expect.poll(direction).toBe((before+1)%4);await tap(40);await expect.poll(direction).toBe(before);
    await page.getByRole('button',{name:'Boost',exact:true}).dispatchEvent('pointerdown',{pointerId:8,pointerType:'touch'});
    expect(await page.evaluate(()=>window.__gltrof.module.ccall('web_control_state','number',['number','number'],[0,3]))).toBe(1);
    await page.getByRole('button',{name:'Boost',exact:true}).dispatchEvent('pointercancel',{pointerId:8,pointerType:'touch'});
    expect(await page.evaluate(()=>window.__gltrof.module.ccall('web_control_state','number',['number','number'],[0,3]))).toBe(0);
    await page.screenshot({path:`visual-review/phone-game-portrait-${info.project.name}.png`});
    await page.setViewportSize({width:844,height:390});await expect.poll(async()=>Math.abs((await dimensions()).aspect-844/390)).toBeLessThan(.01);await page.screenshot({path:`visual-review/phone-game-landscape-${info.project.name}.png`});
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('phone split screen steers each local rider separately in a six-rider game',async({browser},info)=>{
  const context=await browser.newContext({viewport:{width:360,height:800},hasTouch:true});
  try{
    const page=await context.newPage();await page.goto('/');await page.locator('#local-players').selectOption('2');await openHost(page);await page.locator('#create-form [name=gridSize]').selectOption('960');await page.locator('#create-form [name=speed]').selectOption('6');await page.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(page.locator('#lobby')).toBeVisible();
    for(let i=0;i<4;i++){await page.locator('#add-bot').click();await expect(page.locator('#player-list .player')).toHaveCount(3+i);}
    await page.locator('#start-game').click();await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#game-loading')).toBeHidden({timeout:45000});await page.evaluate(()=>document.querySelector('#game').requestFullscreen=undefined);
    const direction=slot=>page.evaluate(slot=>window.__gltrof.module.ccall('web_player_direction','number',['number'],[slot]),slot);
    const before=[await direction(0),await direction(1)];
    for(const [slot,y] of [[0,220],[1,620]]){
      await page.locator('#player-view').dispatchEvent('pointerdown',{pointerId:20+slot,pointerType:'touch',clientX:310,clientY:y});await page.locator('#player-view').dispatchEvent('pointerup',{pointerId:20+slot,pointerType:'touch'});await expect.poll(()=>direction(slot)).toBe((before[slot]+1)%4);
    }
    await expect(page.locator('#scoreboard > span')).toHaveCount(6);
    expect(await page.evaluate(()=>Math.abs(window.__gltrof.module.webViewAspect-.9))).toBeLessThan(.01);
    await page.screenshot({path:`visual-review/phone-six-riders-split-${info.project.name}.png`});
  }finally{await context.close();}
});
