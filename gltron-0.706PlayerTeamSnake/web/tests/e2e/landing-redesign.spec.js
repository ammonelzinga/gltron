import {test,expect} from '@playwright/test';
import {openHost,openAdvanced,openPreferences,openJoinPassword} from './landing-helpers.js';

test('public lobby refresh preserves keyboard focus on Join',async({context})=>{
  const host=await context.newPage(),guest=await context.newPage();await host.goto('/');await openHost(host);await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();const code=await host.locator('#room-code').textContent();
  await guest.goto('/');await guest.locator('#lobby-search').fill(code);const button=guest.locator('.lobby-card [data-join-code]');await expect(button).toHaveCount(1);await button.focus();
  const revision=await guest.evaluate(()=>window.__gltrof.publicRooms[0].authority.revision);
  await expect.poll(()=>guest.evaluate(()=>window.__gltrof.publicRooms[0]?.authority.revision||0)).toBeGreaterThan(revision);await expect(button).toBeFocused();await guest.keyboard.press('Enter');await expect(guest.locator('#lobby')).toBeVisible();
});

test('one remembered identity, focused setup, responsive menu',async({page},info)=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.locator('input[name=playerName]')).toHaveCount(1);
  await expect(page.locator('select[name=localPlayers]')).toHaveCount(1);
  await expect(page.locator('#host-dialog')).toBeHidden();
  await expect(page.locator('#quick-form [name=mode]')).toBeHidden();
  await page.locator('#player-name').fill('Neon Rider');
  await page.locator('#local-players').selectOption('3');
  await openPreferences(page);await page.locator('#quick-form [name=mode]').selectOption('snake');
  await page.locator('#quick-form [name=required-mode]').check();
  await expect(page.locator('#preference-summary')).toContainText('Snake (required)');
  await page.locator('#quick-preferences summary').click();
  await openHost(page);await expect(page.locator('#create-form [name=lobbyName]')).toHaveValue('Neon Rider’s grid');
  await expect(page.locator('#create-form [name=gridSize]')).toHaveValue('720');
  await page.screenshot({path:`visual-review/setup-${info.project.name}.png`});
  await page.keyboard.press('Escape');await expect(page.locator('#host-dialog')).toBeHidden();
  await page.reload();await expect(page.locator('#player-name')).toHaveValue('Neon Rider');
  await expect(page.locator('#local-players')).toHaveValue('3');
  await page.screenshot({path:`visual-review/landing-desktop-${info.project.name}.png`,fullPage:true});
  await page.locator('#player-name').fill('   ');await page.getByRole('button',{name:'Join quick match'}).click();
  expect(await page.locator('#player-name').evaluate(el=>el.validity.valid)).toBe(false);
  await expect(page.locator('#cancel-quick')).toBeHidden();
  await page.locator('#player-name').fill('Neon Rider');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`visual-review/landing-mobile-${width}-${info.project.name}.png`,fullPage:true});
    await openHost(page);expect(await page.locator('#host-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button',{name:'Controls & help'}).click();
  await expect(page.locator('#control-config')).toBeVisible();
});

test('shared name and rider count host a configured game, filtered public Join is one click',async({context},info)=>{
  const host=await context.newPage(),guest=await context.newPage();await host.goto('/');
  await host.locator('#player-name').fill('Gold Host');await host.locator('#local-players').selectOption('2');
  await openHost(host);await host.locator('#create-form [name=lobbyName]').fill(`Gold Grid ${info.project.name}`);
  await host.locator('#create-form [name=mode]').selectOption('snake');
  await host.locator('#create-form [name=speed]').selectOption('11');
  await host.locator('#create-form [name=matchPoints]').fill('9');
  await host.locator('#create-form [name=botDifficulty]').selectOption('3');
  await openAdvanced(host);await host.locator('#create-form [name=clearTrails]').uncheck();
  await host.getByRole('button',{name:'Create lobby',exact:true}).click();
  await expect(host.locator('#lobby')).toBeVisible();await expect(host.locator('#host-dialog')).toBeHidden();
  await expect(host.locator('#player-list .player')).toHaveCount(2);
  await expect(host.locator('#player-list')).toContainText('Gold Host 2');
  const rules=await host.evaluate(()=>window.__gltrof.room.meta);
  expect(rules).toMatchObject({mode:'snake',gridSize:720,speed:11,matchPoints:9,botDifficulty:3,clearTrails:false});
  const code=await host.locator('#room-code').textContent();
  await guest.goto('/');await guest.locator('#player-name').fill('Blue Guest');
  await expect(guest.locator('#local-players')).toHaveValue('1');
  await guest.locator('#lobby-search').fill(code);await expect(guest.locator('.lobby-card')).toHaveCount(1);
  await guest.locator('#lobby-mode').selectOption('classic');await expect(guest.locator('.lobby-card')).toHaveCount(0);
  await expect(guest.locator('.empty-grid')).toContainText('No matching grids');
  await guest.locator('#lobby-mode').selectOption('snake');await expect(guest.locator('.lobby-card')).toHaveCount(1);
  await guest.locator('.lobby-card [data-join-code]').click();
  await expect(guest.locator('#lobby')).toBeVisible();await expect(host.locator('#player-list .player')).toHaveCount(3);
  await expect(host.locator('#player-list')).toContainText('Blue Guest');
});

test('private tournament setup and password code joins use the same identity',async({context})=>{
  const host=await context.newPage(),guest=await context.newPage();await host.goto('/');
  await host.locator('#player-name').fill('Cup Host');await openHost(host);
  await host.locator('#session-kind').selectOption('tournament');await expect(host.locator('#tournament-settings')).toBeVisible();
  await host.locator('#create-form [name=visibility]').selectOption('private');
  await host.locator('[name=maxParallel]').selectOption('2');await host.locator('[name=pointsToWin]').fill('7');
  await openAdvanced(host);await host.locator('#create-form [name=password]').fill('grid-secret');
  await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();
  const code=await host.locator('#room-code').textContent();
  expect(await host.evaluate(()=>window.__gltrof.room.tournament.config)).toMatchObject({maxParallel:2,pointsToWin:7});
  await guest.goto('/?room='+code);await guest.locator('#player-name').fill('Cup Guest');
  await expect(guest.locator('#join-form [name=roomCode]')).toHaveValue(code);
  await openJoinPassword(guest);await guest.locator('#join-form [name=password]').fill('wrong');
  await guest.getByRole('button',{name:'Join lobby',exact:true}).click();
  await expect(guest.locator('#landing-status')).toHaveText('The lobby password is incorrect.');
  await guest.locator('#join-form [name=password]').fill('grid-secret');
  await guest.getByRole('button',{name:'Join lobby',exact:true}).click();
  await expect(guest.locator('#lobby')).toBeVisible();await expect(host.locator('#player-list .player')).toHaveCount(2);
});

test('public password lobby prompts before joining',async({context},info)=>{
  test.skip(info.project.name!=='Chrome','Password code joins are also covered in each browser.');
  const host=await context.newPage(),guest=await context.newPage();await host.goto('/');
  await openHost(host);await openAdvanced(host);await host.locator('#create-form [name=password]').fill('friends-only');
  await host.getByRole('button',{name:'Create lobby',exact:true}).click();await expect(host.locator('#lobby')).toBeVisible();
  const code=await host.locator('#room-code').textContent();
  await guest.goto('/');await guest.locator('#player-name').fill('Password Guest');await guest.locator('#lobby-search').fill(code);
  await guest.locator('.lobby-card [data-join-code]').click();
  await expect(guest.locator('#landing')).toBeVisible();await expect(guest.locator('#join-form [name=roomCode]')).toHaveValue(code);
  await expect(guest.locator('#join-room-password')).toBeFocused();
  await guest.locator('#join-room-password').fill('friends-only');await guest.getByRole('button',{name:'Join lobby',exact:true}).click();
  await expect(guest.locator('#lobby')).toBeVisible();await expect(host.locator('#player-list .player')).toHaveCount(2);
});
