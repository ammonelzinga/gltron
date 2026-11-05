import {openHost,openPreferences,openAdvanced,openJoinPassword} from './landing-helpers.js';
import {test,expect} from '@playwright/test';

test('home saves names, lists configuration and quick joins preferred room',async({context},info)=>{
  const host=await context.newPage(),guest=await context.newPage();
  await host.goto('/');
  await expect(host.locator('#create-form [name=gridSize]')).toHaveValue('720');
  await host.locator('#player-name').fill('Gold Rider');
  const name=`Large snake grid ${info.project.name}`;
  await openHost(host);await host.locator('#create-form [name=lobbyName]').fill(name);
  await host.locator('#create-form [name=mode]').selectOption('snake');
  await host.locator('#create-form [name=botDifficulty]').selectOption('3');
  await host.getByRole('button',{name:'Create lobby'}).click();
  await expect(host.locator('#lobby')).toBeVisible();
  await guest.goto('/');
  const card=guest.locator('.lobby-card').filter({hasText:name});
  await expect(card).toContainText('Large grid');
  await expect(card).toContainText('Classic speed');
  await expect(card).toContainText('Insane');
  await expect(card).toContainText('Crash trails clear');
  await guest.screenshot({path:`visual-review/home-${info.project.name}.png`,fullPage:true});
  await guest.locator('#player-name').fill('Saved Rider');
  await openPreferences(guest);await guest.locator('#quick-form [name=mode]').selectOption('teams');
  await guest.getByRole('button',{name:'Join quick match'}).click();
  await expect(guest.locator('#quick-status')).toContainText('exact preferences');
  await guest.getByRole('button',{name:'Cancel search'}).click();
  await expect(guest.locator('#quick-status')).toContainText('cancelled');
  await openPreferences(guest);await guest.locator('#quick-form [name=mode]').selectOption('snake');
  await guest.getByRole('button',{name:'Join quick match'}).click();
  await expect(guest.locator('#lobby')).toBeVisible();
  await expect(host.locator('#player-list .player')).toHaveCount(2);
  await guest.goto('/');
  await expect(guest.locator('#player-name')).toHaveValue('Saved Rider');await expect(guest.locator('input[name=playerName]')).toHaveCount(1);
  await guest.setViewportSize({width:390,height:844});
  await guest.screenshot({path:`visual-review/home-mobile-${info.project.name}.png`,fullPage:true});
  expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('ordinary match clears crashes and host starts connected rematch',async({context},info)=>{
  const host=await context.newPage(),guest=await context.newPage(),errors=[];
  for(const page of [host,guest])page.on('pageerror',e=>errors.push(e.message));
  await host.goto('/');
  await host.locator('#player-name').fill('Rematch Host');
  await openHost(host);await host.locator('#create-form [name=lobbyName]').fill('Again');
  await host.locator('#create-form [name=gridSize]').selectOption('240');
  await host.locator('#create-form [name=speed]').selectOption('14');
  await host.locator('#create-form [name=matchPoints]').fill('1');
  await host.getByRole('button',{name:'Create lobby'}).click();
  await expect(host.locator('#lobby')).toBeVisible();
  const code=await host.locator('#room-code').textContent();
  await guest.goto(`/?room=${code}`);
  await guest.locator('#player-name').fill('Rematch Guest');
  await guest.getByRole('button',{name:'Join lobby'}).click();
  await expect(host.locator('#player-list .player')).toHaveCount(2);
  await host.getByRole('button',{name:'Start match'}).click();
  await expect(host.locator('#game')).toBeVisible({timeout:35000});await expect(host.locator('#game-loading')).toBeHidden({timeout:30000});
  await host.evaluate(()=>{
    window.crashTrailHeights=[];const m=document.querySelector('#gltron-canvas').gameModule;
    m.webFrameConsumers.push(()=>{for(let i=0;i<2;i++)if(!m.ccall('web_player_active','number',['number'],[i]))window.crashTrailHeights.push(m.ccall('web_crash_state','number',['number','number'],[i,3]));});
  });
  await expect(guest.locator('#rematch-panel')).toBeVisible({timeout:30000});
  const heights=await host.evaluate(()=>window.crashTrailHeights);
  expect(heights.length).toBeGreaterThan(0);expect(heights.every(h=>h===0)).toBe(true);
  await expect(guest.locator('#start-rematch')).toBeHidden();
  await guest.getByRole('button',{name:'Play again',exact:true}).click();
  await expect(host.locator('#rematch-count')).toContainText('1 / 2');
  await guest.screenshot({path:`visual-review/rematch-${info.project.name}.png`});
  await host.evaluate(()=>{
    window.sawRematchStart=false;const m=document.querySelector('#gltron-canvas').gameModule;
    m.webFrameConsumers.push(()=>{if(m.ccall('web_player_active','number',['number'],[0])&&m.ccall('web_player_score','number',['number'],[0])===0)window.sawRematchStart=true;});
  });
  const videoHash=()=>guest.evaluate(()=>{
    const c=document.createElement('canvas');c.width=160;c.height=90;
    const x=c.getContext('2d');x.drawImage(document.querySelector('#player-view'),0,0,160,90);
    let hash=0;for(const value of x.getImageData(0,0,160,90).data)hash=(hash*31+value)|0;
    return hash;
  });
  const before=await videoHash();
  await host.getByRole('button',{name:'Start rematch'}).click();
  await expect(guest.locator('#rematch-panel')).toBeHidden();
  await expect(host.locator('#rematch-panel')).toBeHidden();
  await expect.poll(()=>host.evaluate(()=>window.sawRematchStart)).toBe(true);
  // Firefox does not count MediaStream frames in getVideoPlaybackQuality.
  // Compare displayed pixels instead of relying on that browser statistic.
  await expect.poll(videoHash).not.toBe(before);
  await guest.keyboard.press('ArrowLeft');
  await guest.screenshot({path:`visual-review/rematch-playing-${info.project.name}.png`});
  expect(errors).toEqual([]);
});
