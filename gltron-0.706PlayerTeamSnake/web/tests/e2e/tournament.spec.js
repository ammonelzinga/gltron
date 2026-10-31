import { test, expect } from '@playwright/test';

async function createSevenPlayerTournament(context) {
  const host = await context.newPage();
  await host.goto('/');
  await host.locator('#create-form [name="playerName"]').fill('Host Rider');
  await host.locator('#create-form [name="lobbyName"]').fill('Seven Rider Championship');
  await host.locator('#session-kind').selectOption('tournament');
  await host.locator('[name="maxEntrants"]').selectOption('8');
  await host.locator('[name="playersPerHeat"]').selectOption('4');
  await host.locator('[name="advancePerHeat"]').selectOption('2');
  await host.locator('[name="finalPlayers"]').selectOption('2');
  await host.locator('[name="pointsToWin"]').fill('3');
  await host.locator('[name="maxParallel"]').selectOption('2');
  await host.locator('[name="seeding"]').selectOption('join');
  await host.getByRole('button', { name: 'Create lobby' }).click();
  await expect(host.locator('#lobby')).toBeVisible();
  const code = (await host.locator('#room-code').textContent()).trim();

  const guests = [];
  for (let index = 1; index <= 6; index++) {
    const guest = await context.newPage();
    guests.push(guest);
    await guest.goto(`/?room=${code}`);
    await guest.locator('#join-form [name="playerName"]').fill(`Rider ${index}`);
    await guest.getByRole('button', { name: 'Join lobby' }).click();
    await expect(guest.locator('#lobby')).toBeVisible();
  }
  await expect(host.locator('#player-list .player')).toHaveCount(7);
  return { host, guests, code };
}

async function completeMatch(card) {
  const scores = card.locator('.score-input');
  const count = await scores.count();
  for (let index = 0; index < count; index++) await scores.nth(index).fill(String(count + 3 - index));
  await card.getByRole('button', { name: 'Save result' }).click();
}

test.describe('production lobby smoke tests', () => {
  test('four local riders plus two bots fill a six-rider match', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto('/');
    await page.locator('#create-form [name="playerName"]').fill('Local Rider');
    await page.locator('#create-form [name="lobbyName"]').fill('Full Grid');
    await page.locator('#create-form [name="localPlayers"]').selectOption('4');
    await page.locator('#create-form [name="gridSize"]').selectOption('960');
    await page.locator('#create-form [name="speed"]').selectOption('11');
    await page.getByRole('button', { name: 'Create lobby' }).click();
    await page.getByRole('button', { name: 'Add bot' }).click();
    await page.getByRole('button', { name: 'Add bot' }).click();
    await expect(page.locator('#player-list .player')).toHaveCount(6);
    await expect(page.getByText('Computer')).toHaveCount(2);
    await page.getByRole('button', { name: 'Start match' }).click();
    await expect(page.locator('#player-view')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#scoreboard span')).toHaveCount(6);
    await expect.poll(()=>page.evaluate(()=>Boolean(document.querySelector('#gltron-canvas').gameModule))).toBe(true);
    for (const [key,slot,action] of [['ArrowUp',0,3],['w',1,3],[',',0,4],['q',1,4]]) {
      await page.keyboard.down(key);
      await expect.poll(()=>page.evaluate(([slot,action])=>document.querySelector('#gltron-canvas').gameModule.ccall('web_control_state','number',['number','number'],[slot,action]),[slot,action])).not.toBe(0);
      await page.keyboard.up(key);
      await expect.poll(()=>page.evaluate(([slot,action])=>document.querySelector('#gltron-canvas').gameModule.ccall('web_control_state','number',['number','number'],[slot,action]),[slot,action])).toBe(0);
    }
    expect(browserErrors).toEqual([]);
  });

  test('two riders can start a single match and connect', async ({ context }) => {
    const host = await context.newPage();
    const guest = await context.newPage();
    const browserErrors = [];
    host.on('pageerror', error => browserErrors.push(`host: ${error.message}`));
    guest.on('pageerror', error => browserErrors.push(`guest: ${error.message}`));

    await host.goto('/');
    await host.locator('#create-form [name="playerName"]').fill('Host');
    await host.locator('#create-form [name="lobbyName"]').fill('Two Rider Test');
    await host.getByRole('button', { name: 'Create lobby' }).click();
    await expect(host.locator('#lobby')).toBeVisible();
    const code = (await host.locator('#room-code').textContent()).trim();

    await guest.goto(`/?room=${code}`);
    await guest.locator('#join-form [name="playerName"]').fill('Guest');
    await guest.getByRole('button', { name: 'Join lobby' }).click();
    await expect(host.locator('#player-list .player')).toHaveCount(2);

    await host.getByRole('button', { name: 'Start match' }).click();
    await expect(host.locator('#game')).toBeVisible({timeout:35000});await expect(host.locator('#game-loading')).toBeHidden({ timeout: 30_000 });
    await expect(guest.locator('#game')).toBeVisible({ timeout: 30_000 });
    await expect(guest.locator('#connection-status')).toContainText('connected', { timeout: 30_000 });
    await expect(guest.locator('#player-view')).toBeVisible();await expect(guest.locator('#game')).toBeVisible({timeout:35000});await expect(guest.locator('#game-loading')).toBeHidden({timeout:35000});
    await expect.poll(()=>guest.evaluate(()=>(document.querySelector('#gltron-canvas').gameModule?1:0))).toBeGreaterThan(0);
    const direction=await host.evaluate(()=>document.querySelector('#gltron-canvas').gameModule.ccall('web_player_direction','number',['number'],[0]));
    await host.keyboard.press('ArrowLeft');
    await expect.poll(()=>host.evaluate(()=>document.querySelector('#gltron-canvas').gameModule.ccall('web_player_direction','number',['number'],[0]))).not.toBe(direction);
    const guestDirection=await host.evaluate(()=>document.querySelector('#gltron-canvas').gameModule.ccall('web_player_direction','number',['number'],[1]));
    await guest.keyboard.press('ArrowRight');
    await expect.poll(()=>host.evaluate(()=>document.querySelector('#gltron-canvas').gameModule.ccall('web_player_direction','number',['number'],[1]))).not.toBe(guestDirection);
    await guest.keyboard.down('ArrowUp');
    await expect.poll(()=>host.evaluate(()=>document.querySelector('#gltron-canvas').gameModule.ccall('web_control_state','number',['number','number'],[1,3]))).toBe(1);
    await guest.keyboard.up('ArrowUp');
    await expect.poll(()=>host.evaluate(()=>document.querySelector('#gltron-canvas').gameModule.ccall('web_control_state','number',['number','number'],[1,3]))).toBe(0);
    const pixels=await guest.evaluate(()=>{const video=document.querySelector('#player-view'),canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,320,180);const data=ctx.getImageData(0,0,320,180).data;let lit=0,total=0;for(let i=0;i<data.length;i+=4){const value=Math.max(data[i],data[i+1],data[i+2]);if(value>30)lit++;total+=value;}return{lit,mean:total/(data.length/4)};});
    console.log('Guest visible pixels',pixels);
    await host.screenshot({path:'test-results/host-visible.png'});
    await guest.screenshot({path:'test-results/guest-visible.png'});
    expect(pixels.lit).toBeGreaterThan(1000);
    expect(browserErrors).toEqual([]);
  });

  test('landing and tournament controls render cleanly', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /glTrof/i })).toBeVisible();
    await page.locator('#session-kind').selectOption('tournament');
    await expect(page.locator('#tournament-settings')).toBeVisible();
    await expect(page.getByText('Odd entrant counts are balanced automatically.')).toBeVisible();
  });

  test('private password rooms reject the wrong password and accept the right one', async ({ context }) => {
    const host = await context.newPage();
    await host.goto('/');
    await host.locator('#create-form [name="playerName"]').fill('Host');
    await host.locator('#create-form [name="lobbyName"]').fill('Private Grid');
    await host.locator('#create-form [name="visibility"]').selectOption('private');
    await host.locator('#create-form [name="password"]').fill('neon-secret');
    await host.getByRole('button', { name: 'Create lobby' }).click();
    await expect(host.locator('#lobby')).toBeVisible();
    await expect(host.locator('#lobby')).toBeVisible();
    const code = (await host.locator('#room-code').textContent()).trim();

    const guest = await context.newPage();
    await guest.goto(`/?room=${code}`);
    await guest.locator('#join-form [name="playerName"]').fill('Guest');
    await guest.locator('#join-form [name="password"]').fill('wrong');
    await guest.getByRole('button', { name: 'Join lobby' }).click();
    await expect(guest.locator('#landing-status')).toHaveText('The lobby password is incorrect.');
    await guest.locator('#join-form [name="password"]').fill('neon-secret');
    await guest.getByRole('button', { name: 'Join lobby' }).click();
    await expect(guest.locator('#lobby')).toBeVisible();
    await expect(host.locator('#player-list .player')).toHaveCount(2);
  });
});

test.describe('full tournament flow', () => {
  test('seven people join, advance 4+3 to four to two, and finish', async ({ context }) => {
    const { host, guests, code } = await createSevenPlayerTournament(context);
    await host.getByRole('button', { name: 'Start tournament' }).click();
    await expect(host.locator('.bracket-round').first().locator('.match-card')).toHaveCount(2);
    await expect(host.locator('.bracket-round').first().locator('.match-player')).toHaveCount(7);

    let cards = host.locator('.bracket-round').first().locator('.match-card');
    await completeMatch(cards.nth(0));
    cards = host.locator('.bracket-round').first().locator('.match-card');
    await completeMatch(cards.nth(1));
    await expect(host.locator('.bracket-round')).toHaveCount(2);
    await expect(host.locator('.bracket-round').nth(1).locator('.match-player')).toHaveCount(4);

    await completeMatch(host.locator('.bracket-round').nth(1).locator('.match-card'));
    await expect(host.locator('.bracket-round')).toHaveCount(3);
    await expect(host.locator('.bracket-round').nth(2).locator('.match-player')).toHaveCount(2);

    const finalCard=host.locator('.bracket-round').nth(2).locator('.match-card');
    await finalCard.locator('.score-input').nth(0).fill('9');
    await finalCard.locator('.score-input').nth(1).fill('4');
    const spectator = await context.newPage();
    await spectator.goto(`/?room=${code}`);
    await spectator.locator('#join-form [name="playerName"]').fill('Late Spectator');
    await spectator.getByRole('button', { name: 'Join lobby' }).click();
    await expect(spectator.getByText('Spectator', { exact: true })).toBeVisible();
    await expect(spectator.locator('#spectator-panel')).toBeVisible();

    await expect(host.locator('#player-list .player')).toHaveCount(8);
    await expect(finalCard.locator('.score-input').nth(0)).toHaveValue('9');
    await expect(finalCard.locator('.score-input').nth(1)).toHaveValue('4');
    await finalCard.getByRole('button',{name:'Save result'}).click();
    await expect(host.getByText('Champion', { exact: true })).toBeVisible();
    await expect(host.locator('#rematch-panel')).toBeHidden();
    await expect(host.locator('#tournament-progress')).toHaveText('Tournament complete');
    await expect(guests[0].locator('#tournament-progress')).toHaveText('Tournament complete');
  });

  test('a live tournament arena loads WebAssembly and connects a remote rider', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name === 'Edge', 'Chrome already covers the Chromium media path');
    const host = await context.newPage();
    const browserErrors = [];
    host.on('pageerror', error => browserErrors.push(error.message));
    await host.goto('/');
    await host.locator('#create-form [name="playerName"]').fill('Host');
    await host.locator('#create-form [name="lobbyName"]').fill('Live Arena');
    await host.locator('#session-kind').selectOption('tournament');
    await host.locator('[name="maxEntrants"]').selectOption('8');
    await host.locator('[name="playersPerHeat"]').selectOption('2');
    await host.locator('[name="advancePerHeat"]').selectOption('1');
    await host.getByRole('button', { name: 'Create lobby' }).click();
    await expect(host.locator('#lobby')).toBeVisible();
    const code = (await host.locator('#room-code').textContent()).trim();

    const guest = await context.newPage();
    guest.on('pageerror', error => browserErrors.push(error.message));
    await guest.goto(`/?room=${code}`);
    await guest.locator('#join-form [name="playerName"]').fill('Guest');
    await guest.getByRole('button', { name: 'Join lobby' }).click();
    await expect(host.locator('#player-list .player')).toHaveCount(2);

    await host.getByRole('button', { name: 'Start tournament' }).click();
    await host.getByRole('button', { name: 'Launch arena' }).click();
    await expect(host.locator('#host-arenas canvas')).toBeVisible({ timeout: 30_000 });
    await expect(guest.locator('#game')).toBeVisible({ timeout: 30_000 });
    await expect(guest.locator('#connection-status')).toContainText('connected', { timeout: 30_000 });
    await guest.keyboard.press('ArrowLeft');
    await guest.getByRole('button', { name: 'Exit' }).click();
    await expect(guest.locator('#lobby')).toBeVisible();
    await guest.getByRole('button', { name: 'Return to arena' }).click();
    await expect(guest.locator('#game')).toBeVisible();
    await expect(guest.locator('#connection-status')).toContainText('connected');
    expect(browserErrors).toEqual([]);
  });

  test('the host can run two live arenas concurrently', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'Chrome', 'One full multi-arena media-path run is sufficient');
    const host = await context.newPage();
    await host.goto('/');
    await host.locator('#create-form [name="playerName"]').fill('Host');
    await host.locator('#create-form [name="lobbyName"]').fill('Parallel Arenas');
    await host.locator('#session-kind').selectOption('tournament');
    await host.locator('[name="playersPerHeat"]').selectOption('2');
    await host.locator('[name="advancePerHeat"]').selectOption('1');
    await host.locator('[name="finalPlayers"]').selectOption('2');
    await host.locator('[name="maxParallel"]').selectOption('2');
    await host.locator('[name="seeding"]').selectOption('join');
    await host.getByRole('button', { name: 'Create lobby' }).click();
    await expect(host.locator('#lobby')).toBeVisible();
    await expect(host.locator('#lobby')).toBeVisible();
    const code = (await host.locator('#room-code').textContent()).trim();

    const guests = [];
    for (let index = 1; index <= 3; index++) {
      const guest = await context.newPage();
      guests.push(guest);
      await guest.goto(`/?room=${code}`);
      await guest.locator('#join-form [name="playerName"]').fill(`Guest ${index}`);
      await guest.getByRole('button', { name: 'Join lobby' }).click();
      await expect(guest.locator('#lobby')).toBeVisible();
    }
    await expect(host.locator('#player-list .player')).toHaveCount(4);
    await host.getByRole('button', { name: 'Start tournament' }).click();
    await host.getByRole('button', { name: 'Launch arena' }).first().click();
    await expect(host.locator('#host-arenas canvas')).toHaveCount(1, { timeout: 30_000 });
    await host.getByRole('button', { name: 'Launch arena' }).first().click();
    await expect(host.locator('#host-arenas canvas')).toHaveCount(2, { timeout: 30_000 });
    for (const guest of guests) {
      await expect(guest.locator('#connection-status')).toContainText('connected', { timeout: 30_000 });
    }
  });
});
